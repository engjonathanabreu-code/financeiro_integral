begin;
-- Real active profile identities; every data write and history entry is rolled back.
select set_config('test.profiles',(select jsonb_agg(jsonb_build_object('id',id,'tipo',tipo))::text from public.profiles where ativo=true),true);
set local role authenticated;
do $$
declare
  p jsonb; request jsonb; saved jsonb; ordinary text; adm text; status text;
begin
  for p in select value from jsonb_array_elements(current_setting('test.profiles')::jsonb) loop
    perform set_config('request.jwt.claim.sub',p->>'id',true);
    request := jsonb_build_object('id',gen_random_uuid(),'requesterId',p->>'id','status','Pendente','title','TESTE TRANSACIONAL','response','');
    saved := public.financeiro_save_invoice_request(request);
    if not saved @> jsonb_build_array(request) then raise exception 'Submission failed for %',p->>'tipo'; end if;
    if p->>'tipo'='Administrador' then adm:=p->>'id'; else ordinary:=p->>'id'; end if;
  end loop;
  if adm is null or ordinary is null then raise exception 'Both profiles required'; end if;
  perform set_config('request.jwt.claim.sub',ordinary,true);
  request := jsonb_build_object('id',gen_random_uuid(),'requesterId',ordinary,'status','Pendente','response','');
  perform public.financeiro_save_invoice_request(request);
  foreach status in array array['Aprovada','Rejeitada'] loop
    begin
      perform public.financeiro_save_invoice_request(request || jsonb_build_object('status',status),request);
      raise exception 'SECURITY FAILURE: ordinary RPC decision accepted';
    exception when insufficient_privilege then null; end;
    begin
      update public.financeiro_estado_modulos set dados=(select jsonb_agg(case when value->>'id'=request->>'id' then value||jsonb_build_object('status',status) else value end) from jsonb_array_elements(dados)) where chave='invoiceRequests';
      raise exception 'SECURITY FAILURE: direct status change accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.financeiro_save_invoice_request(jsonb_build_object('id',gen_random_uuid(),'requesterId',ordinary,'status',status));
      raise exception 'SECURITY FAILURE: pre-reviewed insertion accepted';
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.financeiro_save_invoice_request(jsonb_build_object('id',gen_random_uuid(),'requesterId',adm,'status','Pendente'));
    raise exception 'SECURITY FAILURE: spoofed requester accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.financeiro_estado_modulos set dados=(select jsonb_agg(case when value->>'id'=request->>'id' then value||jsonb_build_object('convertedId',123) else value end) from jsonb_array_elements(dados)) where chave='invoiceRequests';
    raise exception 'SECURITY FAILURE: conversion metadata accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.financeiro_estado_modulos where chave='invoiceRequests';
    raise exception 'SECURITY FAILURE: delete accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.financeiro_estado_modulos set chave='invoiceRequests-bypass' where chave='invoiceRequests';
    raise exception 'SECURITY FAILURE: rename accepted';
  exception when insufficient_privilege then null; end;
  -- Existing permissions on unrelated modules are unchanged.
  update public.financeiro_estado_modulos set dados=dados where chave='trips';
  perform set_config('request.jwt.claim.sub',adm,true);
  saved := public.financeiro_save_invoice_request(request||'{"status":"Aprovada","reviewedBy":"ADM"}'::jsonb,request);
  if not saved @> jsonb_build_array(request||'{"status":"Aprovada"}'::jsonb) then raise exception 'Admin approval failed'; end if;
  request := jsonb_build_object('id',gen_random_uuid(),'requesterId',adm,'status','Pendente');
  perform public.financeiro_save_invoice_request(request);
  saved := public.financeiro_save_invoice_request(request||'{"status":"Rejeitada"}'::jsonb,request);
  if not saved @> jsonb_build_array(request||'{"status":"Rejeitada"}'::jsonb) then raise exception 'Admin rejection failed'; end if;
  begin
    perform public.financeiro_save_invoice_request(request||'{"status":"Aprovada"}'::jsonb,request);
    raise exception using errcode='XX000',message='SECURITY FAILURE: stale decision accepted';
  exception when raise_exception then null; end;
  -- Ordinary users can append even after admin decisions, including legacy UPSERT.
  perform set_config('request.jwt.claim.sub',ordinary,true);
  perform public.financeiro_save_invoice_request(jsonb_build_object('id',gen_random_uuid(),'requesterId',ordinary,'status','Pendente'));
  insert into public.financeiro_estado_modulos(chave,dados) select chave,dados from public.financeiro_estado_modulos where chave='invoiceRequests' on conflict(chave) do update set dados=excluded.dados;
end $$;
rollback;
select 'PASS: all active profiles submit; common user denied RPC/direct approval, rejection, spoofing, review metadata, deletion and rename; ADM approves/rejects; stale decisions blocked; legacy upsert works. All writes rolled back.' as result;
