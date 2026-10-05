-- Aplicado no Supabase do ERP em 05/10/2026 (migração financeiro_auditoria_acessos_20261005).
-- Auditoria 05/10/2026 — acessos de usuários limitados e anexos do Financeiro.
-- Não apaga nem altera valores: os anexos em base64 saem de dentro dos módulos e vão,
-- byte a byte, para public.financeiro_arquivos; o registro guarda só o "arquivoId".
-- A versão anterior de cada módulo convertido fica em financeiro_estado_modulos_history.

-- 1) Anexos fora do JSON compartilhado ------------------------------------------------
create schema if not exists financeiro_privado;
revoke all on schema financeiro_privado from public, anon, authenticated;

create table if not exists public.financeiro_arquivos(
  id uuid primary key default gen_random_uuid(),
  sha256 text not null unique,
  nome text,
  tipo text,
  tamanho bigint,
  conteudo text not null check (left(conteudo,5)='data:'),
  criado_em timestamptz not null default now(),
  criado_por uuid
);
comment on table public.financeiro_arquivos is 'Originais (data URL) dos comprovantes do Financeiro. Os módulos guardam apenas arquivoId.';
alter table public.financeiro_arquivos enable row level security;
revoke all on public.financeiro_arquivos from anon;
revoke insert, update, delete, truncate on public.financeiro_arquivos from authenticated;
grant select on public.financeiro_arquivos to authenticated;
drop policy if exists financeiro_arquivos_ler on public.financeiro_arquivos;
-- Mesmo alcance de antes: quem lia o módulo lia o base64 embutido nele.
create policy financeiro_arquivos_ler on public.financeiro_arquivos for select to authenticated
  using ((select public.is_active_user()));

create or replace function financeiro_privado.guardar_arquivo(p_conteudo text, p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare h text; v uuid; b64 text;
begin
  if p_conteudo is null or left(p_conteudo,5) <> 'data:' then return null; end if;
  h := encode(sha256(convert_to(p_conteudo,'UTF8')),'hex');
  b64 := split_part(p_conteudo, ',', 2);
  insert into public.financeiro_arquivos(sha256,nome,tipo,tamanho,conteudo,criado_por)
  values (h, left(p_nome,300), substring(p_conteudo from '^data:([^;,]*)'),
          case when p_conteudo ~ '^data:[^,]*;base64,' then (length(b64)*3/4 - (length(b64)-length(rtrim(b64,'='))))::bigint else length(b64) end,
          p_conteudo, auth.uid())
  on conflict (sha256) do nothing
  returning id into v;
  if v is null then select id into v from public.financeiro_arquivos where sha256 = h; end if;
  return v;
end $$;

-- Troca dataUrl/dataURL/fileData (no item ou em item.file) por arquivoId.
create or replace function financeiro_privado.externalizar(item jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k text; v uuid; out jsonb := item; destino text;
begin
  if jsonb_typeof(item) is distinct from 'object' then return item; end if;
  foreach k in array array['dataUrl','dataURL','fileData'] loop
    if jsonb_typeof(out->k) = 'string' and left(out->>k,5) = 'data:' then
      v := financeiro_privado.guardar_arquivo(out->>k, coalesce(out->>'name', out->'file'->>'name', out->>'doc'));
      destino := case when out ? 'arquivoId' then k||'ArquivoId' else 'arquivoId' end;
      out := (out - k) || jsonb_build_object(destino, v);
    end if;
  end loop;
  if jsonb_typeof(out->'file') = 'object' then
    out := jsonb_set(out, '{file}', financeiro_privado.externalizar(out->'file'));
  end if;
  return out;
end $$;

create or replace function financeiro_privado.antes_gravar_modulo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := clock_timestamp(); end if;
  if new.chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
     and jsonb_typeof(new.dados) = 'array'
     and strpos(new.dados::text, '"data:') > 0 then
    select coalesce(jsonb_agg(financeiro_privado.externalizar(x) order by o), '[]'::jsonb)
      into new.dados
      from jsonb_array_elements(new.dados) with ordinality as t(x,o);
  end if;
  return new;
end $$;
revoke all on all functions in schema financeiro_privado from public, anon, authenticated;

drop trigger if exists financeiro_a_antes_gravar on public.financeiro_estado_modulos;
-- Nome começa por "financeiro_a": roda antes das guardas e do histórico (ordem alfabética).
create trigger financeiro_a_antes_gravar before insert or update on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.antes_gravar_modulo();

-- Envio direto de um anexo pelo navegador (usuário ativo).
create or replace function public.financeiro_guardar_arquivo(p_conteudo text, p_nome text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_user() then raise exception using errcode='42501', message='Entre novamente para enviar o arquivo.'; end if;
  if p_conteudo is null or left(p_conteudo,5) <> 'data:' then raise exception using errcode='22023', message='Arquivo inválido.'; end if;
  if length(p_conteudo) > 28000000 then raise exception using errcode='22023', message='O arquivo deve ter até 20 MB.'; end if;
  return financeiro_privado.guardar_arquivo(p_conteudo, p_nome);
end $$;
revoke all on function public.financeiro_guardar_arquivo(text,text) from public, anon;
grant execute on function public.financeiro_guardar_arquivo(text,text) to authenticated;

-- 2) Quem vê e grava cada módulo -----------------------------------------------------
-- RH, DRE, planejamento e extratos: só ADM. Contas e fluxo de caixa: ADM e setor Financeiro.
-- Orçamentos, viagens, documentos, solicitações e cadastros: todos os usuários ativos (como antes).
create or replace function public.financeiro_modulo_permitido(p_chave text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.ativo
      and (
        p.tipo = 'Administrador'
        or (
          p_chave <> all (array['hrPeople','hrPayments','hrMonthlyVariables','cashflowOverrides','dreOverrides',
                                'dreMonthSource','dreMonthSourcePrev','planRevenues','planExpenses','erpPlannedRevenues',
                                'futureExpenses','plans','revenues','bankImports','lastErpFinancialSync',
                                'lastErpManualSync','lastErpSyncReason'])
          and (
            p_chave <> all (array['accountMasters','accountPayments','accounts','cashflow'])
            or p.tipo = 'Financeiro' or lower(trim(coalesce(p.setor,''))) = 'financeiro'
          )
        )
      )
  );
$$;
revoke all on function public.financeiro_modulo_permitido(text) from public, anon;
grant execute on function public.financeiro_modulo_permitido(text) to authenticated;

-- As três políticas antigas (todas "true") passam a seguir o acesso por módulo; excluir só ADM.
alter policy financeiro_estado_modulos_select on public.financeiro_estado_modulos
  using ((select public.financeiro_modulo_permitido(chave)));
alter policy financeiro_estado_modulos_authenticated on public.financeiro_estado_modulos
  using ((select public.financeiro_modulo_permitido(chave))) with check ((select public.financeiro_modulo_permitido(chave)));
alter policy financeiro_estado_modulos_write on public.financeiro_estado_modulos
  using ((select public.financeiro_modulo_permitido(chave))) with check ((select public.financeiro_modulo_permitido(chave)));
drop policy if exists financeiro_modulos_excluir_somente_adm on public.financeiro_estado_modulos;
create policy financeiro_modulos_excluir_somente_adm on public.financeiro_estado_modulos as restrictive for delete to authenticated
  using ((select public.is_admin()));

-- 3) Restaurar versão do histórico: antes bastava estar logado.
create or replace function public.financeiro_restore_modulo_version(p_chave text, p_history_id bigint)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception using errcode='42501', message='Somente ADM pode restaurar versões.'; end if;
  select dados into v from public.financeiro_estado_modulos_history where id=p_history_id and chave=p_chave;
  if v is null then raise exception 'Versao nao encontrada'; end if;
  update public.financeiro_estado_modulos set dados=v, updated_at=now() where chave=p_chave;
end $$;
revoke all on function public.financeiro_restore_modulo_version(text,bigint) from public, anon;
grant execute on function public.financeiro_restore_modulo_version(text,bigint) to authenticated;
revoke execute on function public.financeiro_estado_modulos_protect_and_history() from public, anon, authenticated;

-- 4) Tabelas espelho/registro do Financeiro: antes qualquer usuário logado lia e gravava.
alter policy financeiro_contas_authenticated on public.financeiro_contas
  using ((select public.can_access_fin_recebimentos())) with check ((select public.can_access_fin_recebimentos()));
alter policy financeiro_pagamentos_authenticated on public.financeiro_pagamentos
  using ((select public.can_access_fin_recebimentos())) with check ((select public.can_access_fin_recebimentos()));
alter policy financeiro_whatsapp_envios_read on public.financeiro_whatsapp_envios
  using ((select public.can_access_fin_recebimentos()));
-- Importações de recebimentos: mesmo critério da política integracao_financeiro_importar.
alter policy fin_receb_importacoes_auth_all on public.fin_receb_importacoes
  using ((select integracao_financeiro_privado.operar())) with check ((select integracao_financeiro_privado.operar()));

-- 5) Converte os anexos já existentes (mesma lista de itens, mesma ordem).
update public.financeiro_estado_modulos set dados = dados
 where chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
   and strpos(dados::text, '"data:') > 0;
