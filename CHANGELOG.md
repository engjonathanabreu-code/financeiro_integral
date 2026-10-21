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

### Correções da revisão interna (antes do PR)
- Comparação canônica de JSON: o `jsonb` devolve chaves em outra ordem, o que deixava módulos sempre "pendentes", reenviava módulos inteiros e podia restaurar registros excluídos por outra pessoa.
- Troca de usuário na mesma aba esvazia (não apaga) módulos sem acesso; Solicitações não viram rascunho; envio interrompido se a sessão mudar; ids duplicados não fundem registros; sem "reaplicar" de conflito no módulo inteiro; indisponibilidade passageira da função não desliga o controle de versão.
- Guarda de viagens aceita a auto-inclusão em responsáveis feita pela edição do colaborador; acesso a anexos tolera responsáveis em formato inválido.
- Lembretes: chave de idempotência estável e nova tentativa só após recusa explícita; publicação documentada com `--no-verify-jwt`.

### Mudança de regra
- Mesmo campo alterado por duas pessoas: antes o último salvamento vencia em silêncio; agora fica o valor já salvo e o outro é apresentado como conflito, com opção de reaplicar.
