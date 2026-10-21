# Segurança — Financeiro Integral

Conferido em 21/10/2026. Nenhuma configuração de produção foi alterada; itens marcados
"preparado" dependem de autorização para aplicar.

## Matriz de permissões vigente (interface, commit 5d287a7)

"Setor" na interface = `profiles.tipo`. Id local de atribuição = `hashId(profiles.id)`
(conferido: 15/15 usuários locais seguem a regra).

| Perfil | Viagens | Despesas/documentos de viagem | Orçamentos | Gastos de orçamento | Documentos fiscais |
|---|---|---|---|---|---|
| Anônimo / inativo | sem acesso | sem acesso | sem acesso | sem acesso | sem acesso |
| Colaborador | vê por setor ou atribuição; cria; edita (exceto aprovar e mudar responsáveis) | inclui e edita nas viagens visíveis | só vê | inclui em orçamento visível e aberto | sem tela (inclusão automática pelo `patch-v6-sync`) |
| Atribuído direto | + edição pelo cartão atribuído | idem | vê | + edita gastos do orçamento | — |
| Financeiro | só atribuição direta | idem colaborador | só atribuição direta | idem atribuído | inclui, edita, exclui |
| ADM | tudo, inclusive aprovar, atribuir, excluir | tudo | criar, editar, excluir (lógico), fechar | tudo | tudo |

### O que o banco aplicará com `financeiro_guarda_registros_20261021.sql` (FIN-03, preparado)
Para quem não é ADM: não exclui viagem, não aprova viagem, não altera `assigned` de viagem
existente; não exclui despesa/documento de viagem; não cria/altera/exclui orçamento; não exclui
gasto; não inclui/altera gasto de orçamento fechado (exceto o vínculo automático `fiscalDocId`);
documentos fiscais só são alterados/excluídos por Financeiro/ADM.

### Regras não aplicadas no banco — precisam de decisão
- Visibilidade por setor/atribuição para **gravação** (hoje qualquer usuário ativo com acesso ao módulo grava qualquer registro do módulo, desde que respeite as regras acima).
- Quem pode marcar viagem "Concluída"/"Divergência" (a interface permite a qualquer editor).
- Dono de despesa (não existe `createdBy` em despesas/gastos).
- Resolução do usuário local por nome/e-mail (homônimos herdam atribuições).
- Normalização de "Financeiro": interface ignora acentos/maiúsculas; banco exige `tipo = 'Financeiro'` ou `setor` = financeiro.

## Anexos (FIN-04, preparado)
Leitura condicionada ao registro (ver `docs/DATABASE.md`). Também corrige o *drift* de privilégios:
em produção `financeiro_arquivos` tem todos os privilégios para `anon` e `authenticated` e
funções `SECURITY DEFINER` executáveis por `PUBLIC/anon` — contido hoje por RLS e checagens internas,
mas divergente da migration de 05/10.

## Bibliotecas de terceiros (FIN-05)

| Biblioteca | Versão | Carregamento | Situação |
|---|---|---|---|
| supabase-js | 2.117.2 (antes `@2` flutuante) | jsDelivr + SRI | fixada |
| jszip | 3.10.1 | jsDelivr + SRI | sem aviso conhecido aplicável |
| jspdf / jspdf-autotable | 2.5.2 / 3.8.4 | jsDelivr + SRI | avisos do jspdf ≤ 4.x; uso restrito a texto, tabela e logos locais. Atualização conjunta (jspdf 4.2.1 + autotable 5.x) pendente de teste de PDFs. |
| xlsx (SheetJS) | 0.18.5 | jsDelivr + SRI | CVE-2023-30533 (corrigido em 0.19.3) e CVE-2024-22363 (0.20.2). **Mitigado** por `financeiro-leitores-seguros.js` (tipo, tamanho ≤ 15 MB, protótipos vigiados e revertidos). Versões corrigidas só em cdn.sheetjs.com — inacessível deste ambiente; atualizar para 0.20.3 hospedando o arquivo oficial conferido. |
| pdfjs-dist | 3.11.174 (worker idem) | jsDelivr + SRI | CVE-2024-4367 (corrigido em 4.2.67). **Mitigado** com `isEvalSupported:false` + assinatura `%PDF-` + tamanho ≤ 20 MB. pdf.js 4+ é só ESM: migração planejada à parte. |
| supabase-js (Edge Function) | 2.49.4 via esm.sh | — | antes `@2` flutuante |

SRI calculado dos pacotes oficiais do npm e conferido pelo Chromium (as 6 bibliotecas
carregaram com `integrity`). O worker do pdf.js não aceita SRI.

## Automação WhatsApp (FIN-06/07)
Conferido na função **publicada** (v3, 25/08/2026): token do agente do CRM **escrito no código**,
`verify_jwt` desligado, agendador sem autenticação (qualquer pessoa pode disparar entre 09:00 e
09:20), sem tempo limite, falha de registro interrompe o lote. A versão do repositório (02/10) nunca
foi publicada. Preparado: função com segredo do agendador, credenciais e telefone só em
configuração, reserva atômica, chave de idempotência estável por conta/destinatário/vencimento,
nova tentativa só após recusa explícita (4xx), "incerto" (5xx, tempo esgotado, rede) sem reenvio
automático e registrado em log, resposta sem dados.
**Ação necessária (com autorização):** rotacionar o token do CRM em coordenação com o serviço
receptor — o valor atual está exposto no código publicado.

## Senhas e MFA (FIN-19, preparado)
- Proteção contra senhas vazadas: **desligada** (advisor). Ativar em Authentication → Policies.
  Efeito: novas senhas/redefinições que constem em vazamentos são recusadas — afeta **todos** os
  sistemas que usam este Auth (ERP, Integração, Financeiro); senhas atuais continuam valendo.
- MFA administrativo: status não verificável por SQL. Proposta: habilitar TOTP e exigir AAL2 para
  `tipo = 'Administrador'` em fase posterior, após comunicar ERP e Integração (a exigência em RLS
  precisa ser coordenada para não bloquear rotinas do Integração).

## Itens sem alteração neste lote
- Políticas amplas do Integração em `fin_receb_*` (qualquer usuário ativo lê clientes com CPF/CNPJ e
  atualiza municípios/remessas): fora do escopo do Financeiro; registrar com o time do Integração.
- `FINANCEIRO_PROTECAO` (bloqueio de esvaziamento) continua valendo; não foi relaxado.
