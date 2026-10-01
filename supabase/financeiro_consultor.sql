-- Additive upgrade; preserve current module permissions and shared JSON format.
begin;
create or replace function public.financeiro_guard_budget_close()
returns trigger language plpgsql security invoker set search_path='' as $$
declare previous jsonb; b jsonb; n jsonb;
begin
 if tg_op='DELETE' then
  if old.chave='budgetRecords' and not coalesce(public.is_admin(),false) then raise exception using errcode='42501',message='Somente ADM pode excluir orçamentos.'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and old.chave='budgetRecords' and new.chave<>old.chave then raise exception using errcode='42501',message='Não é permitido renomear Orçamentos.'; end if;
 if new.chave<>'budgetRecords' then return new; end if;
 if jsonb_typeof(new.dados) is distinct from 'array' then raise exception using errcode='22023',message='Orçamentos devem ser uma lista.'; end if;
 if exists(select 1 from jsonb_array_elements(new.dados) x where coalesce(x->>'id','')='') or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(new.dados) x) then raise exception using errcode='22023',message='IDs de orçamentos inválidos.'; end if;
 if tg_op='UPDATE' then previous:=old.dados; else select dados into previous from public.financeiro_estado_modulos where chave='budgetRecords'; end if;
 previous:=coalesce(previous,'[]');
 if not coalesce(public.is_admin(),false) then
  for b in select value from jsonb_array_elements(previous) loop
   select value into n from jsonb_array_elements(new.dados) where value->>'id'=b->>'id';
   if n is null or (n->'status',n->'closedAt',n->'closedBy') is distinct from (b->'status',b->'closedAt',b->'closedBy') or (b->>'status'='Fechado' and n<>b) then raise exception using errcode='42501',message='Somente ADM pode fechar ou alterar o encerramento de orçamentos.'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(new.dados) x where (x->>'status'='Fechado' or x ?| array['closedAt','closedBy']) and not exists(select 1 from jsonb_array_elements(previous) p where p->>'id'=x->>'id')) then raise exception using errcode='42501',message='Somente ADM pode criar orçamento fechado.'; end if;
 end if;
 -- Once closed, metadata/history cannot be erased by a stale whole-module save.
 for b in select value from jsonb_array_elements(previous) where value->>'status'='Fechado' loop
  select value into n from jsonb_array_elements(new.dados) where value->>'id'=b->>'id';
  if n is null or n->>'status' is distinct from 'Fechado' or n->'closedAt' is distinct from b->'closedAt' or n->'closedBy' is distinct from b->'closedBy' or not coalesce(n->'history','[]') @> coalesce(b->'history','[]') then raise exception using errcode='40001',message='Um orçamento foi fechado. Atualize a tela antes de salvar.'; end if;
 end loop;
 return new;
end $$;
revoke all on function public.financeiro_guard_budget_close() from public;
drop trigger if exists financeiro_guard_budget_close on public.financeiro_estado_modulos;
create trigger financeiro_guard_budget_close before insert or update or delete on public.financeiro_estado_modulos for each row execute function public.financeiro_guard_budget_close();

create or replace function public.financeiro_close_budget(p_id text,p_expected jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare items jsonb; b jsonb; result jsonb; closed jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception using errcode='42501',message='Somente ADM pode fechar orçamentos.'; end if;
 select dados into items from public.financeiro_estado_modulos where chave='budgetRecords' for update;
 select value into b from jsonb_array_elements(coalesce(items,'[]')) where value->>'id'=p_id;
 if b is null or b->>'status'='Fechado' or b->>'active'='false' then raise exception using errcode='22023',message='Orçamento inexistente ou já encerrado.'; end if;
 if b is distinct from p_expected then raise exception using errcode='40001',message='O orçamento mudou. Atualize a tela e confira antes de fechar.'; end if;
 closed:=b||jsonb_build_object('status','Fechado','closedAt',now(),'closedBy',auth.uid(),'history',coalesce(b->'history','[]')||jsonb_build_array(jsonb_build_object('at',now(),'action','Orçamento fechado','by',auth.uid())));
 select jsonb_agg(case when value->>'id'=p_id then closed else value end order by ord) into result from jsonb_array_elements(items) with ordinality as x(value,ord);
 update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='budgetRecords';
 return result;
end $$;
revoke all on function public.financeiro_close_budget(text,jsonb) from public,anon;
grant execute on function public.financeiro_close_budget(text,jsonb) to authenticated;

create or replace function public.financeiro_consultor_base()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception using errcode='42501',message='Agente Financeiro disponível somente para ADM.'; end if;
 select jsonb_object_agg(chave,dados) into result from public.financeiro_estado_modulos where chave=any(array['cashflow','cashflowOverrides','budgetRecords','budgetExpenses','trips','tripExpenses','accountPayments','accountMasters','planRevenues','planExpenses','erpPlannedRevenues','dreMonthSource','dreMonthSourcePrev']);
 return coalesce(result,'{}');
end $$;
revoke all on function public.financeiro_consultor_base() from public,anon;
grant execute on function public.financeiro_consultor_base() to authenticated;
commit;
