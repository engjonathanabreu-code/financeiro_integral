// FIN-06/FIN-07: reserva atômica, idempotência e falhas do lembrete WhatsApp com o SQL real (PGlite)
// e provedor simulado. Nenhuma mensagem real é enviada; telefone e contas são sintéticos.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../supabase/functions/finance-whatsapp-reminders');
const PHONE='5500000000000',NOW={date:'2026-11-15',hour:9,minute:5};
const payments=[{id:'p1',accountId:'a1',due:'2026-11-15',value:10,status:'Pendente'},{id:'p2',accountId:'a1',due:'2026-11-15',value:20},{id:'p3',due:'2026-11-15',status:'Paga'},{id:'p4',due:'2026-11-16'}];
const masters=[{id:'a1',name:'Conta sintética'}];

async function setupDb(){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table financeiro_pagamentos(id text primary key);
  create table financeiro_whatsapp_envios(id uuid primary key default gen_random_uuid(),pagamento_id text not null references financeiro_pagamentos(id) on delete cascade,destinatario text not null,vencimento date not null,status text not null default 'enviado',erro text,enviado_em timestamptz not null default now(),unique(pagamento_id,destinatario));
  grant all on financeiro_whatsapp_envios to authenticated,service_role;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_whatsapp_reserva_20261021.sql'),'utf8'));
 const rpc=async(name,args)=>{
  const keys=Object.keys(args),params=keys.map((_,i)=>`$${i+1}`);
  try{await db.exec('set role service_role');const r=await db.query(`select public.${name}(${keys.map((k,i)=>`${k}=>${params[i]}`).join(',')}) v`,keys.map(k=>args[k]));return {data:r.rows[0].v,error:null}}
  catch(e){return {data:null,error:{message:e.message}}}finally{await db.exec('reset role')}
 };
 return {db,client:{rpc,modules:async()=>({accountPayments:payments,accountMasters:masters})}};
}
const rows=async db=>(await db.query('select pagamento_id,status from financeiro_whatsapp_envios order by 1')).rows.map(r=>`${r.pagamento_id}:${r.status}`);

test('duas execuções simultâneas: cada conta é enviada uma única vez; FK antiga não quebra o registro',async()=>{
 const {run}=await import(path.join(dir,'lembretes.mjs'));
 const {db,client}=await setupDb();
 try{
  const sent=[];
  const send=async(payload,{idempotencyKey})=>{sent.push([payload.payment.id,idempotencyKey]);await new Promise(r=>setTimeout(r,20));return {ok:true,status:200,body:{ok:true}}};
  const [a,b]=await Promise.all([run({db:client,send,now:NOW,phone:PHONE}),run({db:client,send,now:NOW,phone:PHONE})]);
  assert.deepEqual(sent.map(s=>s[0]).sort(),['p1','p2'],'p3 paga e p4 de outro dia ficam de fora; nenhuma duplicada');
  assert.equal(a.body.sent+b.body.sent,2);assert.equal(a.body.skipped+b.body.skipped,2);
  assert.deepEqual(await rows(db),['p1:enviado','p2:enviado']);
  const again=await run({db:client,send,now:NOW,phone:PHONE});assert.equal(again.body.sent,0);assert.equal(sent.length,2,'chamada repetida não reenvia');
  assert.ok(!JSON.stringify([a,b,again]).includes(PHONE)&&!JSON.stringify([a,b]).includes('p1'),'resposta sem telefone nem ids');
 }finally{await db.close()}
});

test('recusa do provedor permite nova tentativa; tempo esgotado vira incerto e não reenvia',async()=>{
 const {run}=await import(path.join(dir,'lembretes.mjs'));
 const {db,client}=await setupDb();
 try{
  let calls=0;
  const keys={};
  const send=async(payload,{signal,idempotencyKey})=>{calls++;(keys[payload.payment.id]=keys[payload.payment.id]||[]).push(idempotencyKey);if(payload.payment.id==='p1')return {ok:false,status:422,body:{ok:false,error:'número inválido'}};
   // provedor que não responde; o timer mantém o processo vivo até o tempo limite da função
   return new Promise((_,rej)=>{const keep=setTimeout(()=>{},5000);signal.addEventListener('abort',()=>{clearTimeout(keep);rej(signal.reason)})})};
  const r=await run({db:client,send,now:NOW,phone:PHONE,timeoutMs:30});
  assert.equal(r.body.error,1);assert.equal(r.body.uncertain,1);
  assert.deepEqual(await rows(db),['p1:erro','p2:incerto']);
  const ok=async(payload,{idempotencyKey})=>{calls++;keys[payload.payment.id].push(idempotencyKey);return {ok:true,status:200,body:{ok:true}}};
  const r2=await run({db:client,send:ok,now:NOW,phone:PHONE});
  assert.equal(r2.body.sent,1,'só a recusa confirmada é tentada de novo');
  assert.deepEqual(await rows(db),['p1:enviado','p2:incerto']);
  assert.equal(keys.p1.length,2);assert.equal(keys.p1[0],keys.p1[1],'mesma chave de idempotência nas tentativas');
  assert.notEqual(keys.p1[0],keys.p2[0]);assert.match(keys.p1[0],/^[0-9a-f]{64}$/);
 }finally{await db.close()}
});

test('provedor aceitou e o registro falhou: fica enviando, vira incerto e nunca é reenviado sozinho',async()=>{
 const {run}=await import(path.join(dir,'lembretes.mjs'));
 const {db,client}=await setupDb();
 try{
  const broken={...client,rpc:(n,a)=>n==='financeiro_whatsapp_finalizar'?Promise.resolve({data:null,error:{message:'falha de rede'}}):client.rpc(n,a)};
  let sends=0;const send=async()=>{sends++;return {ok:true,status:200,body:{ok:true}}};
  const r=await run({db:broken,send,now:NOW,phone:PHONE});
  assert.equal(r.body.uncertain,2);assert.deepEqual(await rows(db),['p1:enviando','p2:enviando']);
  await run({db:client,send,now:NOW,phone:PHONE});assert.equal(sends,2,'reserva em andamento não é reenviada');
  await db.exec(`update financeiro_whatsapp_envios set atualizado_em=now()-interval '11 minutes'`);
  await run({db:client,send,now:NOW,phone:PHONE});
  assert.equal(sends,2);assert.deepEqual(await rows(db),['p1:incerto','p2:incerto']);
 }finally{await db.close()}
});

test('falha em uma conta não interrompe as demais; fora da janela e sem configuração não envia',async()=>{
 const {run,sameSecret,classify}=await import(path.join(dir,'lembretes.mjs'));
 for(const [r,esperado] of [[{ok:true,status:200,body:{ok:true}},'enviado'],[{ok:false,status:422,body:{ok:false}},'erro'],[{ok:false,status:429,body:null},'erro'],[{ok:false,status:503,body:null},'incerto'],[{ok:false,status:504,body:null},'incerto'],[{ok:false,status:408,body:null},'incerto'],[{ok:true,status:200,body:null},'incerto']])assert.equal(classify(r),esperado,JSON.stringify(r));
 const {db,client}=await setupDb();
 try{
  const flaky={...client,rpc:(n,a)=>n==='financeiro_whatsapp_reservar'&&a.p_pagamento_id==='p1'?Promise.resolve({data:null,error:{message:'x'}}):client.rpc(n,a)};
  const send=async()=>({ok:true,status:200,body:{ok:true}});
  const r=await run({db:flaky,send,now:NOW,phone:PHONE});assert.equal(r.body.error,1);assert.equal(r.body.sent,1);
  let n=0;const count=async()=>{n++;return {ok:true,status:200,body:{ok:true}}};
  assert.equal((await run({db:client,send:count,now:{...NOW,hour:10},phone:PHONE})).body.skipped,'outside_send_window');
  assert.equal((await run({db:client,send:count,now:NOW,phone:''})).status,500);assert.equal(n,0);
  assert.equal(sameSecret('abc','abc'),true);assert.equal(sameSecret('abc','abd'),false);assert.equal(sameSecret('',''),false);assert.equal(sameSecret(null,'x'),false);
  await db.exec('set role authenticated');await assert.rejects(db.query(`select financeiro_whatsapp_reservar('p9','1','2026-11-15')`),/permission denied/);
  await assert.rejects(db.query(`insert into financeiro_whatsapp_envios(pagamento_id,destinatario,vencimento) values('x','y','2026-01-01')`),/permission denied/);
 }finally{await db.close()}
});

test('Edge Function: autentica o agendador e não traz credencial nem telefone no código',()=>{
 const src=fs.readFileSync(path.join(dir,'index.ts'),'utf8')+fs.readFileSync(path.join(dir,'lembretes.mjs'),'utf8');
 assert.ok(/x-cron-secret/.test(src)&&/sameSecret\(/.test(src));
 assert.ok(!/\d{11,}/.test(src),'nenhum telefone/código longo fixo');
 assert.ok(!/Bearer [A-Za-z0-9._-]{16,}/.test(src),'nenhum token fixo');
 assert.ok(/supabase-js@\d+\.\d+\.\d+/.test(src),'dependência com versão fixa');
});
