-- Restaura a regra anterior de leitura no vínculo de combustível e preserva vínculos já gravados.
begin;
set local lock_timeout = '5s';

do $rollback$
declare
  alvo constant regprocedure := 'financeiro_veiculos_privado.api(text,jsonb)'::regprocedure;
  arquivo_anterior constant text := $expr$f.id::text=e->'file'->>'arquivoId' and f.conteudo$expr$;
  arquivo_novo constant text := $expr$f.id::text=e->'file'->>'arquivoId' and public.financeiro_pode_ler_arquivo(f.id) and f.conteudo$expr$;
  storage_anterior constant text := $expr$(adm or o.name like eu.id::text||'/%')$expr$;
  storage_novo constant text := $expr$public.financeiro_storage_permitido(o.name,false)$expr$;
  definicao text;
begin
  if (select md5(prosrc) from pg_proc where oid=alvo) is distinct from '671b350953d0bee0e2407ded830e4162' then
    raise exception 'A API de Veículos mudou. Confira o corpo ativo antes de reverter.';
  end if;

  definicao := pg_get_functiondef(alvo);
  execute replace(replace(definicao,arquivo_novo,arquivo_anterior),storage_novo,storage_anterior);

  if (select md5(prosrc) from pg_proc where oid=alvo) is distinct from '431e10fccebb12048e600f53c974f100' then
    raise exception 'O corpo restaurado da API de Veículos diverge do esperado.';
  end if;
end
$rollback$;

commit;
