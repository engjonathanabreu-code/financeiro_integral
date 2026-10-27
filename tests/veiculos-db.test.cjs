const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,login,rpc,id,foto,time,approval,approve,withdrawal}=require('./veiculos-fixtures.cjs');

test('veículos: aprovação ADM, isolamento de perfis, retirada/devolução e dados preservados',async()=>{
 const db=await setup();try{

  await login(db,0);await assert.rejects(rpc(db,'painel'),/permission denied/);
  await login(db,4);await assert.rejects(rpc(db,'painel'),/Sessão ativa/);
  await login(db,2);await assert.rejects(db.query('select financeiro_save_invoice_request($1)',[JSON.stringify(approval())]),/pendentes/);
  await assert.rejects(rpc(db,'retirar',withdrawal()),/aprovad/);
  await login(db,5);assert.equal((await rpc(db,'painel')).admin,false);await assert.rejects(db.query('select financeiro_save_invoice_request($1)',[JSON.stringify(approval())]),/pendentes/);
  await login(db,1);
  await approve(db);const original=(await db.query('select * from financeiro_estado_modulos order by chave')).rows;
  await login(db,3);await assert.rejects(rpc(db,'retirar',withdrawal()),/aprovad/);
  await login(db,2);await assert.rejects(rpc(db,'retirar',{...withdrawal(),foto:{...foto,dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}}),/Foto/);
  assert.equal((await rpc(db,'painel')).usos.length,0,'upload inválido desfaz transação');
  await assert.rejects(rpc(db,'retirar',{...withdrawal(),retirada_em:time(20)}),/data\/hora/);
  const u=await rpc(db,'retirar',withdrawal());assert.equal(u.motorista,id(2));
  assert.equal((await rpc(db,'retirar',withdrawal())).id,u.id,'reenvio idempotente');
  await assert.rejects(db.query('update financeiro_veiculos_usos set motorista=$1',[id(3)]),/permission denied/);
  await assert.rejects(db.query('select * from financeiro_veiculos_arquivos'),/permission denied/);
  const mine=await rpc(db,'painel'),fid=mine.arquivos[0].id;assert.equal((await rpc(db,'arquivo',{id:fid})).dataUrl,foto.dataUrl);
  await login(db,3);assert.equal((await rpc(db,'painel')).usos.length,0);assert.equal((await db.query('select * from financeiro_veiculos_usos')).rows.length,0);await assert.rejects(rpc(db,'arquivo',{id:fid}),/indisponível/);
  await assert.rejects(rpc(db,'devolver',{id:u.id}),/Sem acesso/);
  await login(db,2);
  await assert.rejects(rpc(db,'devolver',{id:u.id,devolucao_em:time(-5),km_final:110,foto}),/inválida/);
  await assert.rejects(rpc(db,'devolver',{id:u.id,devolucao_em:time(0),km_final:99,foto}),/inválida/);
  await assert.rejects(rpc(db,'devolver',{id:u.id,devolucao_em:time(0),km_final:110,foto:{}}),/Foto/);
  assert.equal((await rpc(db,'painel')).usos[0].estado,'aberto');
  await login(db,1);await rpc(db,'devolver',{id:u.id,devolucao_em:time(0),km_final:100,foto});await login(db,2);
  await rpc(db,'devolver',{id:u.id,devolucao_em:time(0),km_final:100,foto});
  const end=await rpc(db,'painel');assert.equal(end.usos[0].km_final,100);assert.equal(end.arquivos.length,2);
  await login(db,1);assert.equal((await rpc(db,'painel')).usos.length,1);
  await db.exec('reset role');assert.deepEqual((await db.query('select * from financeiro_estado_modulos order by chave')).rows,original);
 }finally{await db.close()}
});

test('veículos: disputa de carro, cronologia, km regressiva, revogação e cancelamento auditado',async()=>{
 const db=await setup();try{
  await login(db,1);await approve(db,10);await approve(db,11);await approve(db,12);
  await login(db,2);
  const results=await Promise.allSettled([rpc(db,'retirar',withdrawal(20,10)),rpc(db,'retirar',withdrawal(21,11))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/já está em uso/);
  await rpc(db,'devolver',{id:id(20),devolucao_em:time(0),km_final:140,foto});
  await assert.rejects(rpc(db,'retirar',{...withdrawal(21,11),retirada_em:time(0),km_inicial:139}),/não regressiva/);
  await assert.rejects(rpc(db,'retirar',{...withdrawal(21,11),km_inicial:140}),/data\/hora/);
  await login(db,1);await db.exec("update financeiro_estado_modulos set dados=(select jsonb_agg(case when x->>'id'='"+id(11)+"' then x||'{\"status\":\"Rejeitada\"}'::jsonb else x end) from jsonb_array_elements(dados) x) where chave='invoiceRequests'");await login(db,2);await assert.rejects(rpc(db,'retirar',{...withdrawal(21,11),retirada_em:time(0),km_inicial:140}),/aprovad/);
  await rpc(db,'retirar',withdrawal(22,12,'hb20'));
  await assert.rejects(rpc(db,'cancelar',{id:id(22),motivo:'curto'}),/motivo/);
  await rpc(db,'cancelar',{id:id(22),motivo:'Retirada cadastrada por engano, veículo não circulou.'});
  const painel=await rpc(db,'painel');assert.equal(painel.usos.find(u=>u.id===id(22)).estado,'cancelado');assert.ok(painel.arquivos.some(f=>f.uso_id===id(22)));
  await assert.rejects(rpc(db,'devolver',{id:id(22),devolucao_em:time(0),km_final:200,foto}),/encerrado/);
 }finally{await db.close()}
});

test('veículos: relatos privados, anexos transacionais e vínculo temporal sem acusação',async()=>{
 const db=await setup();try{
  await login(db,1);await approve(db,10);await approve(db,11);
  await login(db,2);await rpc(db,'retirar',withdrawal());await rpc(db,'devolver',{id:id(20),devolucao_em:time(0),km_final:110,foto});
  await assert.rejects(rpc(db,'relatar',{id:id(40),veiculo_id:'gol',descricao:'Foto ausente de teste'}),/Anexe/);
  assert.equal((await rpc(db,'painel')).relatos.length,0);
  await rpc(db,'relatar',{id:id(40),veiculo_id:'gol',descricao:'Condição observada sem associação de responsabilidade.',fotos:[foto]});
  assert.equal((await rpc(db,'painel')).relatos[0].uso_anterior,null,'sem retirada própria: não atribui anterior');
  await rpc(db,'retirar',{...withdrawal(21,11),retirada_em:time(0),km_inicial:110});
  const report={id:id(41),veiculo_id:'gol',descricao:'Risco observado na inspeção inicial, para apuração.',fotos:[foto]};
  await rpc(db,'relatar',report);await rpc(db,'relatar',report);
  let painel=await rpc(db,'painel');assert.equal(painel.relatos.length,2);assert.equal(painel.relatos.find(r=>r.id===id(41)).uso_anterior,id(20));assert.match(painel.relatos[0].natureza,/Alegação/);
  await login(db,3);assert.equal((await rpc(db,'painel')).relatos.length,0);assert.equal((await db.query('select * from financeiro_veiculos_relatos')).rows.length,0);
  await login(db,1);assert.equal((await rpc(db,'painel')).relatos.length,2);
 }finally{await db.close()}
});

test('veículos: combustível reutiliza despesa, valida origem/tempo, deduplica e detecta alteração',async()=>{
 const db=await setup();try{
  await login(db,1);await approve(db);await approve(db,11);
  await login(db,2);await rpc(db,'retirar',withdrawal());await rpc(db,'retirar',withdrawal(21,11,'hb20'));
  const e={id:91,tripId:21,type:'Combustível',date:new Date().toISOString().slice(0,10),value:200,file:{arquivoId:id(91)}};
  await db.exec('reset role');await db.query("update financeiro_estado_modulos set dados=$1 where chave='tripExpenses'",[JSON.stringify([e])]);await login(db,2);
  assert.equal((await rpc(db,'painel')).comprovantes[0].id,91,'candidatos vêm do banco atual, sem depender do cache do navegador');
  const link={id:id(20),despesa_id:'91',esperado:e,litros:40};
  await assert.rejects(rpc(db,'vincular',{...link,esperado:{...e,value:201}}),/alterada/);
  await assert.rejects(rpc(db,'vincular',{...link,litros:-1}),/check constraint/);
  await rpc(db,'vincular',link);await rpc(db,'vincular',link);
  assert.equal((await rpc(db,'painel')).despesas.length,1);assert.equal((await rpc(db,'painel')).despesas[0].centavos,20000);
  await db.exec('reset role');await db.query("update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='tripExpenses'",[JSON.stringify([{...e,id:92}])]);await login(db,2);
  await assert.rejects(rpc(db,'vincular',{...link,despesa_id:'92',esperado:{...e,id:92}}),/mesmo comprovante/);
  await assert.rejects(rpc(db,'vincular',{...link,id:id(21)}),/outro uso|desta viagem/);
  await db.exec('reset role');e.value=220;await db.query("update financeiro_estado_modulos set dados=$1 where chave='tripExpenses'",[JSON.stringify([e])]);await login(db,2);
  assert.equal((await rpc(db,'painel')).despesas[0].atual,false);
  await rpc(db,'vincular',{...link,esperado:e});assert.equal((await rpc(db,'painel')).despesas[0].centavos,22000);
  await db.exec('reset role');assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='tripExpenses'")).rows[0].dados,[e],'vínculo não cria nem altera lançamento');
  const s={...e,id:93,file:{storageBucket:'documentos',storagePath:id(2)+'/recibo.png'}};
  await db.query("insert into storage.objects values('documentos',$1),('documentos',$2)",[s.file.storagePath,id(3)+'/privado.png']);
  await db.query("update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='tripExpenses'",[JSON.stringify([s])]);await login(db,2);
  await rpc(db,'vincular',{id:id(20),despesa_id:'93',esperado:s});
  await db.exec('reset role');s.file.storagePath=id(3)+'/privado.png';await db.query("update financeiro_estado_modulos set dados=$1 where chave='tripExpenses'",[JSON.stringify([e,s])]);await login(db,2);
  await assert.rejects(rpc(db,'vincular',{id:id(20),despesa_id:'93',esperado:s}),/Original.*não encontrado/);
 }finally{await db.close()}
});

test('veículos: aprovação canônica exige categoria, orçamento, data, conversão e guard ativo',async()=>{
 const db=await setup();try{
  await login(db,1);const a=await approve(db);
  for(const change of [{status:'Pendente'},{status:'Rejeitada'},{category:'budget'},{estimatedValue:0},{reviewedAt:''},{convertedId:999},{neededAt:'2000-01-01'},{requesterId:id(3)}]){
   await db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'",[JSON.stringify([{...a,...change}])]);
   await login(db,2);await assert.rejects(rpc(db,'retirar',withdrawal()),/aprovad/);await login(db,1);
  }
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'",[JSON.stringify([a])]);
  await db.exec('reset role;alter table financeiro_estado_modulos disable trigger financeiro_guard_invoice_requests');
  await login(db,2);await assert.rejects(rpc(db,'retirar',withdrawal()),/protegida indisponível/);
  assert.equal((await rpc(db,'painel')).usos.length,0);
 }finally{await db.close()}
});

test('veículos: km NaN, foto superdimensionada e nomes perigosos são tratados no banco',async()=>{
 const db=await setup();try{
  await login(db,1);await approve(db);await login(db,2);
  await assert.rejects(rpc(db,'retirar',{...withdrawal(),km_inicial:'NaN'}),/quilometragem/);
  await assert.rejects(rpc(db,'retirar',{...withdrawal(),foto:{...foto,dataUrl:'data:image/png;base64,'+'A'.repeat(5600001)}}),/4 MB/);
  await rpc(db,'retirar',{...withdrawal(),foto:{...foto,name:'../../arquivo.html'}});
  const p=await rpc(db,'painel');assert.ok(p.arquivos[0].nome.endsWith('.png'));assert.ok(!p.arquivos[0].nome.includes('/'));
 }finally{await db.close()}
});
