# Changelog — Financeiro Integral

## Não publicado — branch `claude/dreamy-hypatia-wni1mg` (21/10/2026)

Preparado e testado em branch. **Nada aplicado em produção**: migrations, Edge Function, proteção de
branch e configurações de Auth aguardam autorização. Ordem e rollback: `docs/DEPLOYMENT.md`.

### Correções
- FIN-01: salvamento com revisão esperada (`financeiro_salvar_modulo`); conflito devolve a versão atual e o navegador mescla e tenta de novo; nenhum sucesso sem confirmação; abas antigas bloqueadas na Fase B.
- FIN-02: atualização entre usuários por revisão (Realtime + foco/reconexão/30 s), sem trocar dados com formulário aberto.
- FIN-03: guarda no banco com as regras de aprovação, atribuição, exclusão e orçamento fechado comprovadas na interface; `updated_by` definido pelo banco.
- FIN-04: leitura de anexo exige acesso ao registro; privilégios divergentes corrigidos.
- FIN-05: leitura protegida de planilhas e PDFs; bibliotecas de CDN com versão exata e SRI.
- FIN-06/07: Edge Function autenticada, sem credenciais no código, com reserva atômica e estado "incerto" sem reenvio; FK que quebraria em 15/11 removida.
- FIN-08: workflow de testes em PR.
- FIN-09: teste de integridade do legado independente do final de linha (o hash antigo era de checkout CRLF).
- FIN-10: Futuro, Arquivados e DRE leem todas as páginas (totais completos).
- FIN-11: estáticos revalidam com ETag; HTML e API sem cache.
- FIN-12: rotas de IA com tempo limite, tratamento de resposta incompleta/inválida, métricas e erro sem detalhes internos.
- FIN-13: rollback documentado e SQL de contas não reabrem acesso.
- FIN-14: cache por identidade, limpeza no logout e rascunho guardado só para o dono.
- FIN-16: indicador salvando/salvo/pendente/conflito/falha; aviso de erro sem mandar recarregar; modal de conflitos acessível.

### Mudança de regra
- Mesmo campo alterado por duas pessoas: antes o último salvamento vencia em silêncio; agora fica o valor já salvo e o outro é apresentado como conflito, com opção de reaplicar.
