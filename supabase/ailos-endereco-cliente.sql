begin;
-- Somente chamadas internas: mantém o endereço do cadastro e os ajustes de cobrança separados.
create function ailos_privado.endereco_cliente(cid uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare salvo jsonb; fontes jsonb; e jsonb; p jsonb;
begin
 select dados into salvo from ailos_privado.pagadores where cliente_id=cid;
 if salvo is not null and coalesce(salvo->>'_origem','manual')<>'integracao' then
   return jsonb_build_object('pagador',salvo-'_origem','origem','cobranca');
 end if;
 select jsonb_agg(distinct dados->'endereco') into fontes from public.integracao_moradores
 where colecao='processos' and referencia_id=cid and jsonb_typeof(dados->'endereco')='object';
 if coalesce(jsonb_array_length(fontes),0)>1 then return jsonb_build_object('pagador','{}'::jsonb,'origem','conflito');end if;
 e=coalesce(fontes->0,'{}'::jsonb);
 p=jsonb_build_object(
   'endereco',case when nullif(trim(e->>'logradouro'),'') is null then '' else concat_ws(', ',nullif(trim(e->>'logradouro'),''),nullif(trim(e->>'numero'),''),nullif(trim(e->>'complemento'),'')) end,
   'bairro',trim(coalesce(e->>'bairro','')),
   'cep',regexp_replace(coalesce(e->>'cep',''),'[.\s-]','','g'),
   'cidade',trim(coalesce(e->>'municipio','')),
   'uf',upper(trim(coalesce(e->>'uf',''))));
 return jsonb_build_object('pagador',p,'origem',case when e='{}'::jsonb then 'ausente' else 'integracao' end);
end $$;
revoke all on function ailos_privado.endereco_cliente(uuid) from public,anon,authenticated;

create function ailos_privado.operar_v3(acao text,dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resultado jsonb; resolvido jsonb; p jsonb; cid uuid; ids uuid[]; origem text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Financeiro') or lower(trim(setor))='financeiro')) then raise exception 'Sem permissão para cobrança bancária';end if;
 if acao='cliente' then
   resultado=ailos_privado.operar_v2(acao,dados);
   return resultado||ailos_privado.endereco_cliente((dados->>'id')::uuid);
 elsif acao in ('preparar','preparar_carne') then
   perform pg_advisory_xact_lock(850240);
   -- Recuperar uma reserva não deve alterar o pagador congelado na emissão.
   if exists(select 1 from ailos_privado.remessas where id=(dados->>'id')::uuid) then
     return ailos_privado.operar_v2(acao,dados-'pagador_confirmado');
   end if;
   if acao='preparar_carne' then ids=array[(dados->>'cliente_id')::uuid];
   else
     select array_agg(distinct fp.cliente_id) into ids from public.fin_receb_parcelas fp
     join jsonb_array_elements(dados->'parcelas') x on fp.id=(x->>'id')::uuid;
   end if;
   foreach cid in array coalesce(ids,array[]::uuid[]) loop
     if not exists(select 1 from public.fin_receb_clientes where id=cid and ativo) then raise exception 'Cliente não encontrado ou inativo';end if;
     resolvido=ailos_privado.endereco_cliente(cid);p=resolvido->'pagador';origem=resolvido->>'origem';
     if dados ? 'pagador_confirmado' and p is distinct from dados->'pagador_confirmado' then raise exception 'O endereço mudou desde a seleção. Busque o cliente novamente para conferir';end if;
     if origem='conflito' then raise exception 'Há endereços diferentes para este cliente. Confira o endereço de cobrança';end if;
     if coalesce(p->>'cep','')!~'^\d{8}$' or coalesce(p->>'uf','')!~'^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' or length(trim(coalesce(p->>'endereco','')))=0 or length(trim(coalesce(p->>'bairro','')))=0 or length(trim(coalesce(p->>'cidade','')))=0 then raise exception 'Complete o endereço de cobrança do cliente';end if;
     if origem='integracao' then
       insert into ailos_privado.pagadores(cliente_id,dados) values(cid,p||jsonb_build_object('_origem','integracao'))
       on conflict(cliente_id) do update set dados=excluded.dados;
     end if;
   end loop;
   return ailos_privado.operar_v2(acao,dados-'pagador_confirmado');
 end if;
 return ailos_privado.operar_v2(acao,dados);
end $$;
revoke all on function ailos_privado.operar_v3(text,jsonb) from public,anon;
grant execute on function ailos_privado.operar_v3(text,jsonb) to authenticated;
revoke execute on function ailos_privado.operar_v2(text,jsonb) from authenticated;
create or replace function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select ailos_privado.operar_v3(acao,dados)$$;
notify pgrst,'reload schema';
commit;
