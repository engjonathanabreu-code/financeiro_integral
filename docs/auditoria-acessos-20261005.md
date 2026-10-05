# Auditoria de acessos — 05/10/2026

Foco: usuários sem perfil Administrador (colaboradores e setor Financeiro). Nenhum dado foi apagado; as funções existentes continuam.

## Corrigido

| # | Problema | Efeito para o usuário | Correção |
|---|---|---|---|
| 1 | Comprovantes de viagem e documentos fiscais eram gravados em base64 dentro do módulo compartilhado (~24 MB) e reenviados a cada salvamento | Salvamentos de viagens com erro 500/tempo esgotado (10 falhas só na manhã de 05/10, até 28 MB por envio) | Originais vão para `financeiro_arquivos`; o módulo guarda só `arquivoId`. Conversão byte a byte; a versão anterior fica em `financeiro_estado_modulos_history` |
| 2 | Qualquer usuário logado lia e gravava todos os módulos, inclusive RH (salários), DRE e planejamento | Exposição de dados sensíveis pela API | RLS por módulo (`financeiro_modulo_permitido`): RH/DRE/planejamento só ADM; Contas e fluxo de caixa ADM + Financeiro; demais módulos como antes |
| 3 | `financeiro_restore_modulo_version` restaurava qualquer módulo para qualquer usuário logado | Qualquer pessoa podia voltar uma versão antiga do financeiro | Exige ADM |
| 4 | `financeiro_contas`, `financeiro_pagamentos`, `financeiro_whatsapp_envios`, `fin_receb_importacoes` abertas a todos | Exposição/alteração indevida | Restritas a ADM/Financeiro (importações: quem opera o financeiro) |
| 5 | Rotas `/api/ai-*` sem autenticação | Qualquer pessoa na internet usava a chave da OpenAI | Exigem sessão do ERP; Contas, Recebimentos e extrato exigem ADM/Financeiro |
| 6 | Cada salvamento substituía o módulo inteiro pela cópia carregada na abertura | Um colaborador desfazia o que o ADM gravou depois (ou o contrário) | Mescla em três vias por id antes de gravar; conflito no mesmo campo mantém o valor local (como antes) |
| 7 | Um módulo recusado pelo banco travava todos os outros e repetia a cada 5 s | Usuário perdia as alterações ao recarregar sem aviso | Cada módulo é gravado separado; erro permanente mostra aviso e não trava os demais |
| 8 | Normalização de orçamentos (V8) regravava `budgetRecords` a cada clique de quem não é ADM | Revertia edições do ADM ou travava os salvamentos | Só o ADM grava a normalização |
| 9 | RH (V20) e sincronização ERP rodavam para todos | Gravavam listas vazias/filtradas | Só ADM |
| 10 | Setor Financeiro: ações em Contas caíam em Documentos Fiscais; menu sumia; Recebimentos voltava para Orçamentos; lista de viagens mudava ao voltar | Tela errada/menu incompleto | Papel aplicado também nas ações internas; menu do setor não é mais escondido pela V8 |
| 11 | Setor do usuário trocado por `profiles.setor` depois do login | Ex.: Diretor de Projetos perdia orçamentos/viagens do próprio setor | Setor continua sendo o tipo do perfil, igual ao login e aos registros |
| 12 | Colaborador podia marcar viagem como "Aprovada" | Aprovação sem ADM | Opção "Aprovada" só para ADM (mantida se já estava aprovada) |

## Ordem de publicação

1. Publicar o código (este commit) na Vercel.
2. Aplicar `supabase/auditoria_acessos_20261005.sql` no Supabase do ERP (feito em 05/10/2026; anexos conferidos byte a byte contra a versão anterior).

O código novo funciona com o banco antigo; o banco novo exige o código novo para quem não é ADM.

## Reverter as políticas (se necessário)

```sql
alter policy financeiro_estado_modulos_select on financeiro_estado_modulos using (true);
alter policy financeiro_estado_modulos_authenticated on financeiro_estado_modulos using (true) with check (true);
alter policy financeiro_estado_modulos_write on financeiro_estado_modulos using (true) with check (true);
drop policy financeiro_modulos_excluir_somente_adm on financeiro_estado_modulos;
```

Os anexos convertidos continuam legíveis pelo código novo; para voltar o base64 ao módulo use as versões em `financeiro_estado_modulos_history`.
