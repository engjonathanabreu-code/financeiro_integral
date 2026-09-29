-- Novos carnês só viram contas a receber após finalizar a emissão em produção.
begin;
alter table ailos_privado.boletos alter column parcela_id drop not null;
create function ailos_privado.operar_v2(acao text,dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg ailos_privado.config; r ailos_privado.remessas; b ailos_privado.boletos; c public.fin_receb_clientes;
x jsonb; v jsonb; itens jsonb='[]'; snap jsonb; rid uuid; bid uuid; n int=0; numero_base int; nn text; valor numeric; venc date;
d date=(now() at time zone 'America/Sao_Paulo')::date; termo text; resultados jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Financeiro') or lower(trim(setor))='financeiro')) then raise exception 'Sem permissão para cobrança bancária';end if;
 if acao='buscar_clientes' then
   termo=lower(translate(trim(coalesce(dados->>'busca','')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'));
   if length(termo)<2 then raise exception 'Digite pelo menos dois caracteres';end if;
   with candidatos as (
     select fc.id,fc.nome,fc.cpf_cnpj,fc.codigo,coalesce(nu.nucleo,'') as nucleo
     from public.fin_receb_clientes fc
     left join lateral (
       select string_agg(distinct coalesce(k.nucleo,ni.dados->>'nome',ni.dados->>'nomeIntegrado',ni.dados->>'codigo'),' · ') as nucleo
       from public.integracao_moradores im
       left join public.integracao_nucleos ni on ni.colecao='nucleos' and ni.registro_id=im.dados->>'nucleoId'
       left join public.processos_kanban k on k.id=ni.referencia_id or k.id::text=im.dados->>'nucleoId' or k.id::text=ni.dados->'externo'->>'kanbanId'
       where im.colecao='processos' and im.referencia_id=fc.id
     ) nu on true where fc.ativo
   ), filtrados as (
     select * from candidatos where position(termo in lower(translate(concat_ws(' ',nome,cpf_cnpj,codigo,nucleo),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')))>0
     or (regexp_replace(termo,'[^0-9]','','g')<>'' and termo !~ '[a-z]' and position(regexp_replace(termo,'[^0-9]','','g') in regexp_replace(cpf_cnpj,'[^0-9]','','g'))>0)
   ) select jsonb_build_object('clientes',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from filtrados order by nome,id limit 30 offset greatest(0,least(coalesce((dados->>'offset')::int,0),100000))) t),'[]'::jsonb),'total',(select count(*) from filtrados)) into resultados;
   return resultados;
 elsif acao='cliente' then
   select * into c from public.fin_receb_clientes where id=(dados->>'id')::uuid and ativo;
   if not found then raise exception 'Cliente não encontrado ou inativo';end if;
   return jsonb_build_object('cliente',to_jsonb(c),'parcelas',coalesce((select jsonb_agg(to_jsonb(p) order by p.vencimento,p.numero) from public.fin_receb_parcelas p where p.cliente_id=c.id and p.ativo),'[]'::jsonb));
 elsif acao='preparar_carne' then
   perform pg_advisory_xact_lock(850240);
   rid=(dados->>'id')::uuid;
   select * into r from ailos_privado.remessas where id=rid;
   if found then
     if r.snapshot->'pedido' is distinct from (dados-'id') then raise exception 'Esta reserva corresponde a outro pedido';end if;
     return r.snapshot;
   end if;
   select * into cfg from ailos_privado.config where id=1 for update;
   if not found then raise exception 'Configure o convênio primeiro';end if;
   select * into c from public.fin_receb_clientes where id=(dados->>'cliente_id')::uuid and ativo for update;
   if not found then raise exception 'Cliente não encontrado ou inativo';end if;
   if jsonb_typeof(dados->'parcelas') is distinct from 'array' or jsonb_array_length(dados->'parcelas') not between 1 and 500 then raise exception 'Informe de 1 a 500 boletos';end if;
   if cfg.dados->>'ambiente'='producao' and exists(select 1 from public.fin_receb_parcelas where cliente_id=c.id and ativo and status in ('Pendente','Inadimplente','Parcial')) and coalesce((dados->>'adicionar_cobrancas')::boolean,false)=false then raise exception 'O cliente já possui parcelas. Confirme que deseja adicionar novas cobranças';end if;
   select ap.dados into v from ailos_privado.pagadores ap where cliente_id=c.id;
   if v is null then raise exception 'Complete o endereço de cobrança do cliente';end if;
   if coalesce(regexp_replace(c.cpf_cnpj,'[^0-9]','','g'),'')!~'^(\d{11}|\d{14})$' then raise exception 'Confira o CPF/CNPJ do cliente';end if;
   for x in select value from jsonb_array_elements(dados->'parcelas') loop
     valor=(x->>'valor')::numeric;venc=(x->>'vencimento')::date;
     if valor is null or valor<=0 or valor>99999999.99 or valor<>round(valor,2) or venc is null or venc<d or venc>'2049-10-13'::date then raise exception 'Confira os valores e vencimentos';end if;
     n=n+1;bid=gen_random_uuid();
     if cfg.ultimo_boleto+n>999999999 or cfg.ultima_remessa>=999999 then raise exception 'Numeração bancária esgotada';end if;
     nn=cfg.dados->>'conta'||(cfg.dados->>'conta_dv')||lpad((cfg.ultimo_boleto+n)::text,9,'0');
     itens=itens||jsonb_build_array(jsonb_build_object('id',bid,'parcela_id',gen_random_uuid(),'cliente_id',c.id,'nova_parcela',true,'ordem',n,'total',jsonb_array_length(dados->'parcelas'),'nosso_numero',nn,'documento','INT'||lpad((cfg.ultimo_boleto+n)::text,9,'0'),'valor',valor,'vencimento',venc,'pagador',v||jsonb_build_object('nome',c.nome,'cpf_cnpj',regexp_replace(c.cpf_cnpj,'[^0-9]','','g'))));
   end loop;
   snap=jsonb_build_object('id',rid,'tipo','carne','pedido',dados-'id','sequencia',cfg.ultima_remessa+1,'data',d,'config',cfg.dados,'boletos',itens);
   insert into ailos_privado.remessas(id,sequencia,ambiente,autor,snapshot) values(rid,cfg.ultima_remessa+1,cfg.dados->>'ambiente',auth.uid(),snap);
   for x in select value from jsonb_array_elements(itens) loop
     insert into ailos_privado.boletos(id,remessa_id,ambiente,nosso_numero,snapshot) values((x->>'id')::uuid,rid,cfg.dados->>'ambiente',x->>'nosso_numero',x);
   end loop;
   update ailos_privado.config set ultimo_boleto=ultimo_boleto+n,ultima_remessa=ultima_remessa+1 where id=1;
   return snap;
 elsif acao='finalizar' then
   select * into r from ailos_privado.remessas where id=(dados->>'id')::uuid for update;
   if r.snapshot->>'tipo' is distinct from 'carne' then return ailos_privado.operar(acao,dados);end if;
   if r.arquivo is not null then return jsonb_build_object('ok',true);end if;
   if length(coalesce(dados->>'arquivo',''))=0 or length(dados->>'arquivo')>3000000 or jsonb_typeof(dados->'codigos') is distinct from 'array' or jsonb_array_length(dados->'codigos')<>jsonb_array_length(r.snapshot->'boletos') then raise exception 'Remessa incompleta';end if;
   if (select count(distinct value->>'id') from jsonb_array_elements(dados->'codigos'))<>jsonb_array_length(dados->'codigos') then raise exception 'Boletos duplicados';end if;
   select * into c from public.fin_receb_clientes where id=(r.snapshot->'pedido'->>'cliente_id')::uuid and ativo for update;
   if not found then raise exception 'Cliente não encontrado ou inativo';end if;
   if r.ambiente='producao' and exists(select 1 from public.fin_receb_parcelas where cliente_id=c.id and ativo and status in ('Pendente','Inadimplente','Parcial')) and coalesce((r.snapshot->'pedido'->>'adicionar_cobrancas')::boolean,false)=false then raise exception 'O cliente passou a ter parcelas em aberto. Revise a reserva antes de adicionar cobranças';end if;
   select coalesce(max(numero),0) into numero_base from public.fin_receb_parcelas where cliente_id=c.id;
   for x in select value from jsonb_array_elements(dados->'codigos') loop
     select * into b from ailos_privado.boletos where id=(x->>'id')::uuid and remessa_id=r.id for update;
     if not found or coalesce(x->>'linha_digitavel','')!~'^085\d{44}$' or coalesce(x->>'codigo_barras','')!~'^085\d{41}$' then raise exception 'Código de boleto inválido';end if;
     if (b.snapshot->>'vencimento')::date<d then raise exception 'O vencimento reservado já passou. Revise a cobrança';end if;
     if r.ambiente='producao' then
       insert into public.fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,status,ativo,nosso_numero,documento,linha_digitavel)
       values((b.snapshot->>'parcela_id')::uuid,c.id,numero_base+(b.snapshot->>'ordem')::int,(b.snapshot->>'vencimento')::date,(b.snapshot->>'valor')::numeric,'Pendente',true,b.nosso_numero,b.snapshot->>'documento',x->>'linha_digitavel');
     end if;
     update ailos_privado.boletos set parcela_id=case when r.ambiente='producao' then (b.snapshot->>'parcela_id')::uuid else null end,estado='Gerado',linha_digitavel=x->>'linha_digitavel',codigo_barras=x->>'codigo_barras' where id=b.id;
   end loop;
   update ailos_privado.remessas set arquivo=dados->>'arquivo',nome=dados->>'nome' where id=r.id;
   return jsonb_build_object('ok',true);
 end if;
 return ailos_privado.operar(acao,dados);
end $$;
revoke all on function ailos_privado.operar_v2(text,jsonb) from public,anon;
grant execute on function ailos_privado.operar_v2(text,jsonb) to authenticated;
create or replace function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select ailos_privado.operar_v2(acao,dados)$$;
revoke execute on function ailos_privado.operar(text,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
