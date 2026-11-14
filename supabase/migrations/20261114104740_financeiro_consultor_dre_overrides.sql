begin;

create or replace function public.financeiro_consultor_base()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception using errcode='42501',message='Agente Financeiro disponível somente para ADM.';
  end if;
  select jsonb_object_agg(chave,dados) into result
    from public.financeiro_estado_modulos
    where chave=any(array['cashflow','cashflowOverrides','budgetRecords','budgetExpenses','trips','tripExpenses',
      'accountPayments','accountMasters','planRevenues','planExpenses','erpPlannedRevenues',
      'dreOverrides','dreMonthSource','dreMonthSourcePrev']);
  return coalesce(result,'{}');
end $$;

revoke all on function public.financeiro_consultor_base() from public,anon;
grant execute on function public.financeiro_consultor_base() to authenticated;

commit;
