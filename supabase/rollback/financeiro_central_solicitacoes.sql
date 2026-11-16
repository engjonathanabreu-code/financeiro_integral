-- Reversão operacional. Publique a interface compatível anterior antes deste SQL.
-- O histórico, os anexos e os estados da central continuam guardados.
-- Não remova a guarda de compatibilidade da aprovação: ela impede aprovar
-- um pedido devolvido, cancelado ou excluído a partir da interface anterior.
begin;
set local lock_timeout='5s';

revoke execute on function
  public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb),
  public.financeiro_categoria_solicitacao(text),
  public.financeiro_ler_notificacao_solicitacao(bigint)
from authenticated;

-- Reativação após correção: restaure EXECUTE a authenticated para estas
-- três assinaturas e publique novamente a interface que usa a central.
commit;
