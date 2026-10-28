/* Opcional. PostgreSQL descartável já iniciado, sem TCP, credenciais ou serviços remotos.
   VEHICLE_PG_SOCKET=/tmp/veiculos-pg-socket VEHICLE_PG_DRIVER=/caminho/pg node scripts/test-veiculos-postgres.cjs */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Client}=require(process.env.VEHICLE_PG_DRIVER||'pg');
const {setup,login,rpc,id,foto,time,approval,withdrawal}=require('../tests/veiculos-fixtures.cjs');
const dir=path.join(__dirname,'../docs/qa-veiculos'),checks=[],waits=[];
const config={host:process.env.VEHICLE_PG_SOCKET||'/tmp/veiculos-pg-socket',port:55439,database:'postgres',user:os.userInfo().username,application_name:'veiculos-validation'};
const clients=[];
async function connect(){const c=new Client(config);await c.connect();clients.push(c);c.exec=(...args)=>c.query(...args);return c}
async function identity(c,n){await login(c,n);return (await c.query('select pg_backend_pid() pid')).rows[0].pid}
async function blocked(observer,waiter,blocker,label){
 for(let i=0;i<40;i++){
  const r=(await observer.query('select pid,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1',[waiter])).rows[0];
  if(r?.wait_event_type==='Lock'&&r.blockers.includes(blocker)){waits.push({label,...r});return}
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw Error(`Não foi comprovado bloqueio entre sessões: ${label}`);
}
const settle=p=>p.then(value=>({ok:true,value}),error=>({ok:false,error}));
async function snapshot(c){return (await c.query(`select jsonb_build_object(
 'modules',(select jsonb_agg(to_jsonb(m) order by chave) from public.financeiro_estado_modulos m),
 'old_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl,'rls',c.relrowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','financeiro_arquivos','financeiro_estado_modulos')),
 'old_functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'source',pg_get_functiondef(p.oid),'acl',p.proacl) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('is_admin','is_active_user','financeiro_guard_invoice_requests','financeiro_save_invoice_request')),
 'storage_policies',(select coalesce(jsonb_agg(to_jsonb(p) order by policyname),'[]') from pg_policies p where schemaname='storage')) data`)).rows[0].data}
async function approveExisting(admin,driver,n){
 const approved={...approval(n),vehicleId:n===12?'hb20':'gol'},pending={...approved,status:'Pendente',response:'',createdAt:new Date().toISOString()};
 delete pending.reviewedAt;delete pending.reviewedBy;delete pending.convertedId;
 await identity(driver,2);
 await driver.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify(pending),null]);
 await assert.rejects(driver.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify(approved),JSON.stringify(pending)]),/Somente ADM/);
 await identity(admin,1);
 const complete={...pending,...approved,response:'Aprovada exclusivamente no banco de teste'};
 await admin.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify(complete),JSON.stringify(pending)]);
 const t={id:approved.convertedId,invoiceRequestId:approved.id,city:'Destino sintético',assigned:[2],sector:'Projetos',plannedAmount:approved.estimatedValue};
 await admin.query("update financeiro_estado_modulos set dados=(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(dados)x where x->>'id'<>$1)||$2::jsonb where chave='trips'",[String(t.id),JSON.stringify([t])]);
 return complete;
}
(async()=>{try{
 const owner=await connect(),a=await connect(),b=await connect(),admin=await connect();
 const server=(await owner.query("select version(),current_setting('listen_addresses') listen_addresses,current_setting('port') port")).rows[0];
 assert.equal(server.listen_addresses,'','somente socket Unix; sem TCP');
 let before;
 await setup(owner,async c=>{before=await snapshot(c)},false);
 assert.deepEqual(await snapshot(owner),before);checks.push('Migração real PG17: dados, funções, grants e políticas antigos preservados');
 await owner.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261028121955_financeiro_veiculos_agendamento.sql'),'utf8'));
 const afterSchedule=await snapshot(owner);assert.deepEqual(afterSchedule.modules,before.modules);assert.deepEqual(afterSchedule.old_tables,before.old_tables);assert.deepEqual(afterSchedule.storage_policies,before.storage_policies);
 for(const fn of before.old_functions){const current=afterSchedule.old_functions.find(f=>f.name===fn.name);assert.deepEqual(current.acl,fn.acl);if(!['financeiro_guard_invoice_requests','financeiro_save_invoice_request'].includes(fn.name))assert.deepEqual(current,fn)}
 checks.push('Correção de agendamento preserva dados, tabelas, RLS, grants e funções de identidade');
 // RLS de suporte é um fixture local. As políticas novas são exatamente as da migração.
 await owner.query('alter table financeiro_estado_modulos enable row level security;create policy fixture_existing_active on financeiro_estado_modulos to authenticated using(is_active_user()) with check(is_active_user())');
 for(const n of [10,11,12,13])await approveExisting(admin,a,n);
 checks.push('Fluxo existente: colaborador envia Pendente, não aprova; ADM aprova com expected snapshot e conversão consistente');
 const legacyBefore=(await owner.query('select chave,dados from financeiro_estado_modulos order by chave')).rows;
 const pidA=await identity(a,2),pidB=await identity(b,2);
 assert.notEqual(pidA,pidB);
 await a.query('begin');const first=await rpc(a,'retirar',withdrawal(20,10));
 const competing=settle(rpc(b,'retirar',withdrawal(21,11)));
 await blocked(owner,pidB,pidA,'duas retiradas distintas do Gol');await a.query('commit');
 const loser=await competing;assert.equal(loser.ok,false);assert.match(loser.error.message,/já está em uso/);
 assert.equal((await owner.query("select count(*)::int n from financeiro_veiculos_usos where veiculo_id='gol' and estado='aberto'")).rows[0].n,1);
 checks.push('Concorrência real: segunda sessão espera primeira e rejeita outra retirada do mesmo carro');
 await a.query('begin');const shared=withdrawal(22,12,'hb20');await rpc(a,'retirar',shared);
 const repeated=settle(rpc(b,'retirar',shared));await blocked(owner,pidB,pidA,'mesmo UUID em duas sessões');await a.query('commit');
 assert.equal((await repeated).value.id,id(22));assert.equal((await owner.query('select count(*)::int n from financeiro_veiculos_arquivos where uso_id=$1',[id(22)])).rows[0].n,1);
 checks.push('Reenvio concorrente: mesmo UUID retorna o registro único e conserva uma foto');
 // RLS e RPC executados por role não privilegiada; inspeção do owner só para evidência.
 await identity(b,3);assert.equal((await b.query('select * from financeiro_veiculos_usos')).rows.length,0);
 const fid=(await rpc(a,'painel')).arquivos[0].id;
 await assert.rejects(rpc(b,'arquivo',{id:fid}),/indisponível/);
 await assert.rejects(b.query('insert into financeiro_veiculos(id,nome) values($1,$2)',['x','X']),/permission denied/);
 await assert.rejects(b.query('update financeiro_veiculos_usos set motorista=$1',[id(3)]),/permission denied/);
 await assert.rejects(b.query('select * from financeiro_veiculos_arquivos'),/permission denied/);
 await identity(b,0);await assert.rejects(rpc(b,'painel'),/permission denied/);
 await identity(b,4);await assert.rejects(rpc(b,'painel'),/Sessão ativa/);
 await identity(b,5);assert.equal((await rpc(b,'painel')).admin,false);
 await identity(admin,1);assert.equal((await rpc(admin,'painel')).usos.length,2);
 checks.push('RLS/servidor reais: outro usuário, anônimo, inativo e Financeiro sem poderes de ADM; escrita direta e leitura privada negadas');
 await identity(b,2);
 await rpc(a,'relatar',{id:id(40),veiculo_id:'gol',descricao:'Observação sintética restrita ao autor e administradores.',fotos:[foto]});
 await identity(b,3);assert.equal((await b.query('select * from financeiro_veiculos_relatos')).rows.length,0);
 assert.equal((await rpc(admin,'painel')).relatos.length,1);await identity(b,2);
 checks.push('Relatos privados: autor/ADM leem; outro colaborador não lê nem via SELECT direto');
 await a.query('begin');await rpc(a,'devolver',{id:first.id,devolucao_em:time(0),km_final:120,foto});
 const finishing=settle(rpc(b,'devolver',{id:first.id,devolucao_em:time(0),km_final:120,foto}));
 await blocked(owner,pidB,pidA,'devoluções concorrentes do mesmo uso');await a.query('commit');assert.equal((await finishing).value.estado,'devolvido');
 assert.equal((await owner.query('select count(*)::int n from financeiro_veiculos_arquivos where uso_id=$1',[first.id])).rows[0].n,2);
 checks.push('Devolução concorrente: serializada, idempotente, duas fotos totais e km final único');
 // A decisão existente segura a linha do módulo enquanto a retirada tenta consultá-la.
 const pendingRejection=(await admin.query("select dados from financeiro_estado_modulos where chave='invoiceRequests'")).rows[0].dados.find(r=>r.id===id(13));
 await admin.query('begin');await admin.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify({...pendingRejection,status:'Rejeitada'}),JSON.stringify(pendingRejection)]);
 const rejected=settle(rpc(b,'retirar',{...withdrawal(23,13),km_inicial:120,retirada_em:time(0)}));
 const pidAdmin=(await admin.query('select pg_backend_pid() pid')).rows[0].pid;
 await blocked(owner,pidB,pidAdmin,'retirada disputa com decisão ADM de Solicitações');await admin.query('commit');
 const rejection=await rejected;assert.equal(rejection.ok,false);assert.match(rejection.error.message,/aprovad/);
 checks.push('Aprovação concorrente: retirada espera decisão ADM em outra sessão e respeita rejeição confirmada');
 // Guardamos a mudança autorizada do fixture (decisão acima) e conferimos que o módulo não regravou outros JSONs.
 const after=(await owner.query('select chave,dados from financeiro_estado_modulos order by chave')).rows;
 for(const row of legacyBefore.filter(r=>r.chave!=='invoiceRequests'))assert.deepEqual(after.find(r=>r.chave===row.chave),row);
 checks.push('Operações do módulo preservaram todos os módulos legados; única mudança de fixture foi a decisão ADM intencional');
 const security=(await owner.query("select c.relname,c.relrowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'financeiro_veiculos%' and c.relkind='r' order by c.relname")).rows;
 assert.ok(security.every(t=>t.relrowsecurity));
 const procedures=(await owner.query("select n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='financeiro_veiculos_privado' or (n.nspname='public' and p.proname='financeiro_veiculos_api') order by 1,2")).rows;
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'postgres-real.json'),JSON.stringify({result:'passed',server,independentBackends:[pidA,pidB],checks,lockEvidence:waits,security,procedures,storageLimit:'Sem serviço Supabase Storage local; storage.objects do fixture não é prova de upload/download HTTP real.',network:'Unix socket privado; sem TCP ou credenciais'},null,2));
 console.log(`${checks.length} cenários PostgreSQL real passaram, com ${waits.length} bloqueios entre sessões comprovados por pg_blocking_pids.`);
 }finally{await Promise.allSettled(clients.map(async c=>{await c.query('rollback').catch(()=>{});await c.end()}))}
})().catch(e=>{console.error(e);process.exitCode=1});
