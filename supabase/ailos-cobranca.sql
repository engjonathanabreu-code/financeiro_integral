-- Instalação aditiva. Dados bancários isolados; parcelas existentes são a fonte financeira.
begin;
create schema if not exists ailos_privado;
revoke all on schema ailos_privado from public,anon,authenticated;
grant usage on schema ailos_privado to authenticated;
create table ailos_privado.config (id int primary key check(id=1), dados jsonb not null, ultimo_boleto bigint not null check(ultimo_boleto between 0 and 999999999), ultima_remessa int not null check(ultima_remessa between 0 and 999999));
create table ailos_privado.pagadores (cliente_id uuid primary key references public.fin_receb_clientes(id), dados jsonb not null);
create table ailos_privado.remessas (id uuid primary key, sequencia int unique not null, ambiente text not null check(ambiente in ('homologacao','producao')), criado_em timestamptz not null default now(), autor uuid not null, snapshot jsonb not null, arquivo text, nome text);
create table ailos_privado.boletos (id uuid primary key, parcela_id uuid not null references public.fin_receb_parcelas(id), remessa_id uuid not null references ailos_privado.remessas(id), ambiente text not null, nosso_numero text unique not null, snapshot jsonb not null, estado text not null default 'Reservado', linha_digitavel text, codigo_barras text, ocorrencia text, motivos text, unique(ambiente,parcela_id));
create table ailos_privado.retornos (hash text primary key, nome text not null, criado_em timestamptz not null default now(), autor uuid not null, resultado jsonb not null);
create table ailos_privado.eventos (chave text primary key, boleto_id uuid not null references ailos_privado.boletos(id), autor uuid not null, criado_em timestamptz not null default now(), dados jsonb not null);
alter table ailos_privado.config enable row level security;
alter table ailos_privado.pagadores enable row level security;
alter table ailos_privado.remessas enable row level security;
alter table ailos_privado.boletos enable row level security;
alter table ailos_privado.retornos enable row level security;
alter table ailos_privado.eventos enable row level security;
revoke all on all tables in schema ailos_privado from public,anon,authenticated;

-- A função privada centraliza a autorização e transações; a fachada pública é invoker.
create function ailos_privado.operar(acao text, dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg ailos_privado.config; r ailos_privado.remessas; b ailos_privado.boletos;
p public.fin_receb_parcelas; c public.fin_receb_clientes; x jsonb; v jsonb; snap jsonb; itens jsonb='[]';
n int=0; d date=(now() at time zone 'America/Sao_Paulo')::date; rid uuid; bid uuid; nn text; evento_chave text; valor numeric; resultado jsonb; versao bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Financeiro') or lower(trim(setor))='financeiro')) then raise exception 'Sem permissão para cobrança bancária'; end if;
 if acao='painel' then
   select * into cfg from ailos_privado.config where id=1;
   return jsonb_build_object('config',cfg.dados,'ultimo_boleto',cfg.ultimo_boleto,'ultima_remessa',cfg.ultima_remessa,
    'pagadores',coalesce((select jsonb_object_agg(ap.cliente_id,ap.dados) from ailos_privado.pagadores ap),'{}'::jsonb),
    'remessas',coalesce((select jsonb_agg(to_jsonb(t) order by sequencia desc) from (select id,sequencia,ambiente,criado_em,nome,arquivo is not null as pronta from ailos_privado.remessas order by sequencia desc limit 100)t),'[]'::jsonb),
    'boletos',coalesce((select jsonb_agg(to_jsonb(t)) from (select id,parcela_id,ambiente,nosso_numero,estado,ocorrencia,motivos from ailos_privado.boletos)t),'[]'::jsonb));
 elsif acao='configurar' then
   perform pg_advisory_xact_lock(850240);
   select * into cfg from ailos_privado.config where id=1 for update;
   v=dados->'config';
   if coalesce(v->>'ambiente','') not in ('homologacao','producao') or coalesce(v->>'convenio','') !~ '^\d{6}$' or coalesce(v->>'conta','') !~ '^\d{7}$' or coalesce(v->>'conta_dv','') !~ '^\d$' or coalesce(v->>'agencia','') !~ '^\d{4}$' or coalesce(v->>'agencia_dv','') !~ '^\d$' or v->>'carteira' is distinct from '01' or coalesce(v->>'cpf_cnpj','') !~ '^(\d{11}|\d{14})$' then raise exception 'Configuração bancária inválida'; end if;
   if v->>'ambiente'='producao' and (coalesce((v->>'homologado')::boolean,false)=false or length(trim(coalesce(v->>'protocolo','')))<3) then raise exception 'Informe a confirmação de homologação da cooperativa';end if;
   if exists(select 1 from ailos_privado.remessas) and (v-array['ambiente','homologado','protocolo']) is distinct from (cfg.dados-array['ambiente','homologado','protocolo']) then raise exception 'Há remessas emitidas: a identidade bancária não pode ser alterada';end if;
   if (dados->>'ultimo_boleto')::bigint<coalesce(cfg.ultimo_boleto,0) or (dados->>'ultima_remessa')::int<coalesce(cfg.ultima_remessa,0) then raise exception 'A numeração não pode retroceder';end if;
   if exists(select 1 from public.fin_receb_parcelas where nosso_numero ~ '^\d{17}$' and left(nosso_numero,8)=v->>'conta'||(v->>'conta_dv') and right(nosso_numero,9)::bigint>(dados->>'ultimo_boleto')::bigint) then raise exception 'Já existem boletos com numeração superior: confira o último número com o banco';end if;
   insert into ailos_privado.config values(1,v,(dados->>'ultimo_boleto')::bigint,(dados->>'ultima_remessa')::int) on conflict(id) do update set dados=excluded.dados,ultimo_boleto=excluded.ultimo_boleto,ultima_remessa=excluded.ultima_remessa;
   return jsonb_build_object('ok',true);
 elsif acao='pagador' then
   if not exists(select 1 from public.fin_receb_clientes where id=(dados->>'cliente_id')::uuid and ativo) then raise exception 'Cliente não encontrado';end if;
   v=dados->'pagador';
   if coalesce(v->>'cep','')!~'^\d{8}$' or length(coalesce(v->>'uf',''))<>2 or length(trim(coalesce(v->>'endereco','')))=0 then raise exception 'Preencha o endereço completo';end if;
   insert into ailos_privado.pagadores values((dados->>'cliente_id')::uuid,v) on conflict(cliente_id) do update set dados=excluded.dados;
   return jsonb_build_object('ok',true);
 elsif acao='preparar' then
   rid=(dados->>'id')::uuid;
   perform pg_advisory_xact_lock(850240);
   select * into r from ailos_privado.remessas where id=rid;
   if found then return r.snapshot;end if;
   select * into cfg from ailos_privado.config where id=1 for update;
   if not found then raise exception 'Configure o convênio primeiro';end if;
   if jsonb_typeof(dados->'parcelas') is distinct from 'array' or jsonb_array_length(dados->'parcelas') not between 1 and 500 then raise exception 'Selecione de 1 a 500 parcelas';end if;
   for x in select value from jsonb_array_elements(dados->'parcelas') order by value->>'id' loop
     select * into p from public.fin_receb_parcelas where id=(x->>'id')::uuid for update;
     if not found or not p.ativo or p.status not in ('Pendente','Inadimplente') or coalesce(p.valor_liquidado,0)<>0 or p.versao is distinct from (x->>'versao')::bigint then raise exception 'Parcela alterada, inativa ou já paga. Atualize a tela';end if;
     if p.vencimento<d or p.valor_previsto+coalesce(p.juros,0)+coalesce(p.multa,0)<=0 then raise exception 'Confira o vencimento e o valor da parcela';end if;
     if coalesce(p.nosso_numero,'')<>'' or coalesce(p.linha_digitavel,'')<>'' then raise exception 'Parcela já possui boleto: não é permitido emitir outra cobrança';end if;
     if exists(select 1 from ailos_privado.boletos where parcela_id=p.id and ambiente=cfg.dados->>'ambiente') then raise exception 'Parcela já reservada: use o histórico para recuperar a remessa';end if;
     select * into c from public.fin_receb_clientes where id=p.cliente_id and ativo;
     if not found then raise exception 'Cliente inativo';end if;
     select ap.dados into v from ailos_privado.pagadores ap where cliente_id=c.id;
     if v is null then raise exception 'Complete o endereço de cobrança do cliente';end if;
     n=n+1;bid=gen_random_uuid();nn=cfg.dados->>'conta'||(cfg.dados->>'conta_dv')||lpad((cfg.ultimo_boleto+n)::text,9,'0');
     if cfg.ultimo_boleto+n>999999999 or cfg.ultima_remessa>=999999 then raise exception 'Numeração bancária esgotada';end if;
     itens=itens||jsonb_build_array(jsonb_build_object('id',bid,'parcela_id',p.id,'versao',p.versao,'nosso_numero',nn,'documento','INT'||lpad((cfg.ultimo_boleto+n)::text,9,'0'),'valor',p.valor_previsto+coalesce(p.juros,0)+coalesce(p.multa,0),'vencimento',p.vencimento,'pagador',v||jsonb_build_object('nome',c.nome,'cpf_cnpj',regexp_replace(c.cpf_cnpj,'[^0-9]','','g'))));
   end loop;
   snap=jsonb_build_object('id',rid,'sequencia',cfg.ultima_remessa+1,'data',d,'config',cfg.dados,'boletos',itens);
   insert into ailos_privado.remessas(id,sequencia,ambiente,autor,snapshot) values(rid,cfg.ultima_remessa+1,cfg.dados->>'ambiente',auth.uid(),snap);
   for x in select value from jsonb_array_elements(itens) loop
     insert into ailos_privado.boletos(id,parcela_id,remessa_id,ambiente,nosso_numero,snapshot) values((x->>'id')::uuid,(x->>'parcela_id')::uuid,rid,cfg.dados->>'ambiente',x->>'nosso_numero',x);
   end loop;
   update ailos_privado.config set ultimo_boleto=ultimo_boleto+n,ultima_remessa=ultima_remessa+1 where id=1;
   return snap;
 elsif acao='remessa' then
   select * into r from ailos_privado.remessas where id=(dados->>'id')::uuid;
   if not found then raise exception 'Remessa não encontrada';end if;
   return r.snapshot||jsonb_build_object('arquivo',r.arquivo,'nome',r.nome,'estados',(select jsonb_object_agg(id,estado) from ailos_privado.boletos where remessa_id=r.id));
 elsif acao='finalizar' then
   select * into r from ailos_privado.remessas where id=(dados->>'id')::uuid for update;
   if not found then raise exception 'Remessa não encontrada';end if;
   if r.arquivo is not null then return jsonb_build_object('ok',true);end if;
   if length(coalesce(dados->>'arquivo',''))=0 or length(dados->>'arquivo')>3000000 or jsonb_array_length(dados->'codigos')<>(select count(*) from ailos_privado.boletos where remessa_id=r.id) then raise exception 'Remessa incompleta';end if;
   if (select count(distinct value->>'id') from jsonb_array_elements(dados->'codigos'))<>jsonb_array_length(dados->'codigos') then raise exception 'Boletos duplicados';end if;
   for x in select value from jsonb_array_elements(dados->'codigos') order by value->>'id' loop
     select * into b from ailos_privado.boletos where id=(x->>'id')::uuid and remessa_id=r.id for update;
     if not found or coalesce(x->>'linha_digitavel','')!~'^085\d{44}$' or coalesce(x->>'codigo_barras','')!~'^085\d{41}$' then raise exception 'Código de boleto inválido';end if;
     select * into p from public.fin_receb_parcelas where id=b.parcela_id for update;
     if p.versao is distinct from (b.snapshot->>'versao')::bigint or not p.ativo or p.status not in ('Pendente','Inadimplente') then raise exception 'Parcela mudou após a reserva. Confira antes de emitir';end if;
     update ailos_privado.boletos set estado='Gerado',linha_digitavel=x->>'linha_digitavel',codigo_barras=x->>'codigo_barras' where id=b.id;
     if r.ambiente='producao' then
       update public.fin_receb_parcelas set nosso_numero=b.nosso_numero,documento=b.snapshot->>'documento',linha_digitavel=x->>'linha_digitavel' where id=p.id;
     end if;
   end loop;
   update ailos_privado.remessas set arquivo=dados->>'arquivo',nome=dados->>'nome' where id=r.id;
   return jsonb_build_object('ok',true);
 elsif acao='retorno' then
   perform pg_advisory_xact_lock(850240);
   if coalesce(dados->>'hash','')!~'^[a-f0-9]{64}$' then raise exception 'Identificador do arquivo inválido';end if;
   select ar.resultado into resultado from ailos_privado.retornos ar where hash=dados->>'hash';
   if found then return resultado||jsonb_build_object('repetido',true);end if;
   if jsonb_typeof(dados->'eventos') is distinct from 'array' or jsonb_array_length(dados->'eventos') not between 1 and 500 then raise exception 'Retorno vazio ou acima de 500 títulos';end if;
   for x in select value from jsonb_array_elements(dados->'eventos') order by value->>'nosso_numero',value->>'data',value->>'ocorrencia' loop
     select * into b from ailos_privado.boletos where nosso_numero=x->>'nosso_numero' for update;
     if not found then raise exception 'Retorno contém título não emitido neste módulo: %',x->>'nosso_numero';end if;
     if b.ambiente is distinct from dados->>'ambiente' then raise exception 'Ambiente do retorno não corresponde à emissão';end if;
     if b.estado='Reservado' then raise exception 'A geração deste boleto não foi concluída';end if;
     if (x->>'valor_centavos')::numeric<>100*(b.snapshot->>'valor')::numeric or (x->>'vencimento')::date<>(b.snapshot->>'vencimento')::date or (x->>'cpf_cnpj')::numeric<>(b.snapshot->'pagador'->>'cpf_cnpj')::numeric or x->>'documento' is distinct from b.snapshot->>'documento' then raise exception 'Dados do retorno divergem da cobrança emitida';end if;
     evento_chave=md5(jsonb_build_array(b.id,x->>'ocorrencia',x->>'data',x->>'pago_centavos',x->>'liquido_centavos',x->>'motivos')::text);
     if exists(select 1 from ailos_privado.eventos where eventos.chave=evento_chave) then continue;end if;
     select * into p from public.fin_receb_parcelas where id=b.parcela_id for update;
     if b.ambiente='producao' and (not p.ativo or p.status='Cancelado' or p.nosso_numero is distinct from b.nosso_numero or p.vencimento<>(b.snapshot->>'vencimento')::date or p.valor_previsto+coalesce(p.juros,0)+coalesce(p.multa,0)<>(b.snapshot->>'valor')::numeric) then raise exception 'Parcela alterada desde a emissão. Concilie a divergência antes de importar';end if;
     if x->>'ocorrencia' in ('06','17') then
       valor=(x->>'pago_centavos')::numeric/100;
       if valor<=0 or (x->>'data')::date>d then raise exception 'Data ou valor de pagamento inválido';end if;
       if b.estado='Liquidado' then raise exception 'Título já liquidado com evento diferente: confira o retorno';end if;
       if b.ambiente='producao' then
         if coalesce(p.valor_liquidado,0)<>0 or p.status in ('Pago','Parcial') then raise exception 'Parcela já possui pagamento. Confira a conciliação manual';end if;
         update public.fin_receb_parcelas set status=case when valor>=(b.snapshot->>'valor')::numeric then 'Pago' else 'Parcial' end,pago_em=(x->>'data')::date,valor_liquidado=valor,diferenca=valor-(b.snapshot->>'valor')::numeric where id=b.parcela_id;
       end if;
       update ailos_privado.boletos set estado=case when valor>=(b.snapshot->>'valor')::numeric then 'Liquidado' else 'Conferir parcial' end,ocorrencia=x->>'ocorrencia',motivos=x->>'motivos' where id=b.id;
     elsif b.estado not in ('Liquidado','Conferir parcial') then
       update ailos_privado.boletos set estado=case x->>'ocorrencia' when '02' then 'Registrado' when '03' then 'Rejeitado' when '09' then 'Baixado' else 'Conferir ocorrência' end,ocorrencia=x->>'ocorrencia',motivos=x->>'motivos' where id=b.id;
     end if;
     insert into ailos_privado.eventos(chave,boleto_id,autor,dados) values(evento_chave,b.id,auth.uid(),x);n=n+1;
   end loop;
   resultado=jsonb_build_object('processados',n,'repetido',false);
   insert into ailos_privado.retornos(hash,nome,autor,resultado) values(dados->>'hash',left(dados->>'nome',240),auth.uid(),resultado);
   return resultado;
 else raise exception 'Operação inválida';end if;
end $$;
revoke all on function ailos_privado.operar(text,jsonb) from public,anon;
grant execute on function ailos_privado.operar(text,jsonb) to authenticated;
create function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select ailos_privado.operar(acao,dados)$$;
revoke all on function public.financeiro_ailos(text,jsonb) from public,anon;
grant execute on function public.financeiro_ailos(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
