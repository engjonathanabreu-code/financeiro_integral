begin;
set local lock_timeout = '5s';

-- Restaura o encaminhamento de busca, endereço e carnê. A fachada aplica
-- a autorização antes de chamar qualquer etapa do Ailos.
create or replace function public.financeiro_ailos(acao text, dados jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare resultado jsonb;
begin
  if not public.can_access_fin_recebimentos()
     or (acao = 'configurar' and not public.is_admin()) then
    raise exception using errcode = '42501', message = 'Sem permissão para esta ação de cobrança bancária.';
  end if;

  if acao = 'configurar' and dados->'config'->>'ambiente' = 'producao' then
    raise exception using errcode = '42501', message = 'A ativação comercial exige a homologação do retorno bancário.';
  end if;
  if acao = 'retorno' then
    if dados->>'ambiente' is distinct from 'homologacao' then
      raise exception using errcode = '42501', message = 'Retorno comercial depende de validação do arquivo original no servidor.';
    end if;
    perform financeiro_baixas_privado.abrir_escrita('ailos', null);
    resultado := ailos_privado.operar_v3(acao,dados);
    perform financeiro_baixas_privado.fechar_escrita();
    return resultado;
  end if;

  return ailos_privado.operar_v3(acao,dados);
end;
$$;

revoke all on function public.financeiro_ailos(text,jsonb) from public,anon;
grant execute on function public.financeiro_ailos(text,jsonb) to authenticated;
revoke execute on function ailos_privado.operar(text,jsonb) from public,anon,authenticated;
revoke execute on function ailos_privado.operar_v2(text,jsonb) from public,anon,authenticated;
revoke execute on function ailos_privado.operar_v3(text,jsonb) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
