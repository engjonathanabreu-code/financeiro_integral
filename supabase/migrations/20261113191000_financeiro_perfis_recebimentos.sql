begin;
set local lock_timeout='5s';

create or replace function public.can_access_fin_recebimentos()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.profiles p
    where p.id=(select auth.uid()) and p.ativo
      and (lower(trim(p.tipo))='administrador' or (
        lower(trim(coalesce(p.tipo,''))) not like 'diretor%'
        and (lower(trim(p.tipo))='financeiro' or lower(trim(p.setor))='financeiro')
      ))
  );
$$;
revoke all on function public.can_access_fin_recebimentos() from public,anon;
grant execute on function public.can_access_fin_recebimentos() to authenticated,service_role;

-- O cadastro de clientes continua compartilhado com o CRM. As parcelas e
-- importações detalhadas ficam restritas ao Financeiro e à administração.
create policy financeiro_parcelas_perfil_restrito
  on public.fin_receb_parcelas as restrictive for all to authenticated
  using ((select public.can_access_fin_recebimentos()))
  with check ((select public.can_access_fin_recebimentos()));
create policy financeiro_importacoes_perfil_restrito
  on public.fin_receb_importacoes as restrictive for all to authenticated
  using ((select public.can_access_fin_recebimentos()))
  with check ((select public.can_access_fin_recebimentos()));

-- Contas continua com as operações de rotina existentes; exclusão é administrativa.
create policy financeiro_contas_exclusao_administrada
  on public.financeiro_contas as restrictive for delete to authenticated
  using ((select public.is_admin()));
create policy financeiro_pagamentos_exclusao_administrada
  on public.financeiro_pagamentos as restrictive for delete to authenticated
  using ((select public.is_admin()));
create policy financeiro_envios_historico_administrado
  on public.financeiro_whatsapp_envios as restrictive for select to authenticated
  using ((select public.is_admin()));

create or replace function financeiro_privado.impedir_exclusao_contas()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if auth.uid() is null or (select public.is_admin())
     or old.chave not in ('accounts','accountMasters','accountPayments') then
    return new;
  end if;
  if new.chave is distinct from old.chave
     or (jsonb_typeof(old.dados)='array' and (
       jsonb_typeof(new.dados) is distinct from 'array'
       or exists (
         select 1 from jsonb_array_elements(old.dados) original
         where original->>'id' is not null and not exists (
           select 1 from jsonb_array_elements(case when jsonb_typeof(new.dados)='array' then new.dados else '[]'::jsonb end) atual
           where atual->>'id'=original->>'id'
         )
       )
     )) then
    raise exception using errcode='42501',message='Somente ADM pode excluir contas ou pagamentos.';
  end if;
  return new;
end $$;
revoke all on function financeiro_privado.impedir_exclusao_contas() from public,anon,authenticated;
create trigger financeiro_guardar_contas_existentes
  before update on public.financeiro_estado_modulos for each row
  execute function financeiro_privado.impedir_exclusao_contas();

-- Restringe também RPCs de escrita que usam autorização própria.
create or replace function integracao_financeiro_privado.operar()
returns boolean language sql stable security definer set search_path=''
as $$select public.can_access_fin_recebimentos()$$;
revoke all on function integracao_financeiro_privado.operar() from public,anon;
grant execute on function integracao_financeiro_privado.operar() to authenticated;

-- A assinatura pública e as chaves de ordenação/paginação do Integração
-- permanecem. A direção recebe totais municipais, sem detalhamento de núcleo.
create or replace function public.integracao_financeiro_resumo(p_inicio date,p_fim date)
returns table(municipio_id uuid,remessa_id uuid,nucleo_id text,clientes bigint,parcelas bigint,pagas bigint,previsto numeric,recebido numeric)
language plpgsql stable security definer set search_path='' as $$
declare completo boolean := public.can_access_fin_recebimentos();
begin
  if auth.uid() is null or not (completo or exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.ativo
      and lower(trim(p.tipo)) in ('diretor técnico','diretor de projetos','diretor de projeto')
  )) then
    raise exception using errcode='42501',message='Sem acesso ao resumo financeiro.';
  end if;
  if p_inicio is null or p_fim is null or p_fim<=p_inicio or p_fim-p_inicio>366 then
    raise exception using errcode='22023',message='Período inválido para o resumo financeiro.';
  end if;
  if not completo and (p_inicio <> date_trunc('month',p_inicio::timestamp)::date
      or p_fim <> (p_inicio+interval '1 month')::date) then
    raise exception using errcode='22023',message='O resumo da direção usa uma competência mensal.';
  end if;
  return query
  with extras as materialized (
    select distinct on(m.referencia_id) m.referencia_id,m.dados->>'nucleoId' as nucleo
    from public.integracao_moradores m
    where completo and m.colecao='processos' and m.referencia_id is not null
    order by m.referencia_id,m.registro_id
  ), pagamentos as (
    select a.cliente_id,count(*) as qtd,count(*) filter(where a.status='Pago') as quitadas,
      sum(a.valor_previsto+coalesce(a.juros,0)+coalesce(a.multa,0)) as nominal,
      sum(coalesce(a.valor_liquidado,0)) as liquidado
    from public.fin_receb_parcelas a
    where a.ativo and a.status<>'Cancelado' and a.vencimento>=p_inicio and a.vencimento<p_fim
    group by a.cliente_id
  )
  select c.municipio_id,case when completo then c.remessa_id end,
    coalesce(e.nucleo,''),count(*),coalesce(sum(p.qtd),0)::bigint,
    coalesce(sum(p.quitadas),0)::bigint,coalesce(sum(p.nominal),0),
    coalesce(sum(p.liquidado),0)
  from public.fin_receb_clientes c
  left join pagamentos p on p.cliente_id=c.id
  left join extras e on e.referencia_id=c.id
  where c.ativo
  group by 1,2,3;
end;
$$;
revoke all on function public.integracao_financeiro_resumo(date,date) from public,anon;
grant execute on function public.integracao_financeiro_resumo(date,date) to authenticated;
-- Autoriza a fachada e bloqueia chamada direta à implementação da cobrança.
do $ailos_acl$
begin
  if to_regprocedure('ailos_privado.operar(text,jsonb)') is not null then
    alter function ailos_privado.operar(text,jsonb) rename to operar_legado_p1;
    revoke all on function ailos_privado.operar_legado_p1(text,jsonb) from public,anon,authenticated;
    execute $ddl$
      create function ailos_privado.operar(acao text,dados jsonb) returns jsonb
      language plpgsql security definer set search_path='' as $fn$
      begin
        if not public.can_access_fin_recebimentos()
           or (acao='configurar' and not public.is_admin()) then
          raise exception using errcode='42501',message='Sem permissão para esta ação de cobrança bancária.';
        end if;
        return ailos_privado.operar_legado_p1(acao,dados);
      end $fn$
    $ddl$;
    revoke all on function ailos_privado.operar(text,jsonb) from public,anon;
    grant execute on function ailos_privado.operar(text,jsonb) to authenticated;
    execute $ddl$
      create or replace function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb)
      returns jsonb language sql security invoker set search_path=''
      as $fn$select ailos_privado.operar(acao,dados)$fn$
    $ddl$;
    revoke all on function public.financeiro_ailos(text,jsonb) from public,anon;
    grant execute on function public.financeiro_ailos(text,jsonb) to authenticated;
  end if;
end $ailos_acl$;

commit;
