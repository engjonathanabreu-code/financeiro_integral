-- Aplica as regras de leitura de comprovantes ao vínculo de combustível em Veículos.
-- A RPC continua conferindo motorista ou ADM, uso, despesa, período e versão esperada.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  alvo constant regprocedure := 'financeiro_veiculos_privado.api(text,jsonb)'::regprocedure;
  arquivo_anterior constant text := $expr$f.id::text=e->'file'->>'arquivoId' and f.conteudo$expr$;
  arquivo_novo constant text := $expr$f.id::text=e->'file'->>'arquivoId' and public.financeiro_pode_ler_arquivo(f.id) and f.conteudo$expr$;
  storage_anterior constant text := $expr$(adm or o.name like eu.id::text||'/%')$expr$;
  storage_novo constant text := $expr$public.financeiro_storage_permitido(o.name,false)$expr$;
  definicao text;
begin
  if to_regprocedure('public.financeiro_pode_ler_arquivo(uuid)') is null
     or to_regprocedure('public.financeiro_storage_permitido(text,boolean)') is null then
    raise exception 'A proteção de comprovantes deve estar instalada antes deste ajuste.';
  end if;
  if (select md5(prosrc) from pg_proc where oid=alvo) is distinct from '431e10fccebb12048e600f53c974f100' then
    raise exception 'A API de Veículos mudou. Confira o corpo ativo antes de aplicar.';
  end if;

  definicao := pg_get_functiondef(alvo);
  execute replace(replace(definicao,arquivo_anterior,arquivo_novo),storage_anterior,storage_novo);

  if (select md5(prosrc) from pg_proc where oid=alvo) is distinct from '671b350953d0bee0e2407ded830e4162' then
    raise exception 'O corpo resultante da API de Veículos diverge do esperado.';
  end if;
end
$migration$;

commit;
