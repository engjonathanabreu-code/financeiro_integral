# Testes — Financeiro Integral

```bash
pnpm install --frozen-lockfile   # ou npm install (instala @electric-sql/pglite)
npm test                         # node --test tests/*.test.js tests/*.test.cjs
npm run test:ailos               # recorte de cobrança Ailos
```

Não há lint nem verificação de tipos declarados no `package.json`. A Edge Function (`index.ts`)
não é verificada por `deno check` neste ambiente (Deno indisponível); sua lógica fica em
`lembretes.mjs`, testada em Node.

Todos os testes usam **dados sintéticos**; nenhum teste acessa o Supabase de produção, a OpenAI ou
o provedor de WhatsApp.

## Suítes acrescentadas em 21/10/2026

| Arquivo | Cobre |
|---|---|
| `modulos-revisao-db.test.cjs` | Fase A/B em PGlite: revisão, conflito sem gravação, permissões e guardas preservadas, fechamento/solicitações, bloqueio de abas antigas, restauração do ADM e service role. |
| `concorrencia-pg.test.cjs` | **PostgreSQL real** com sessões simultâneas: reproduz a perda do UPSERT antigo; segunda sessão espera o bloqueio e recebe conflito; 10 gravações paralelas → exatamente 1 vence. Pulado (com motivo) se não houver PostgreSQL local. |
| `sincronizacao-modulos.test.cjs` | Duas sessões do navegador intercaladas (registros diferentes, mesmo campo, exclusão × edição), falha de rede e recarga, resposta sem confirmação, persistência, troca de usuário/logout, atualização remota sem ciclo e adiada com formulário aberto, compatibilidade sem migration. |
| `guarda-registros-db.test.cjs` | FIN-03 por perfil (colaborador, Financeiro, ADM, inativo) pelo UPDATE direto e pela RPC. |
| `anexos-acesso-db.test.cjs` | FIN-04: leitura por ADM, autor, setor, atribuição, Financeiro; anônimo e inativo negados; id local igual ao do navegador. |
| `whatsapp-lembretes.test.cjs` | FIN-06/07 com SQL real e provedor simulado: execuções simultâneas, recusa, tempo esgotado, aceito-sem-registro, isolamento de falhas, ausência de credenciais no código. |
| `leitores-seguros.test.cjs` | FIN-05: tipo/tamanho, poluição de protótipo, PDF falso, `isEvalSupported:false`, versões/SRI do `index.html`. |
| `ia-respostas.test.cjs` | FIN-12: tempo limite, indisponibilidade, resposta incompleta/inválida, conteúdo injetado, erro sem detalhes internos. |
| `paginacao-recuperacao.test.cjs` | FIN-10 (leitura completa com qualquer `max_rows`) e FIN-13 (nenhum SQL ou documento recomenda política aberta a todos). |

Alterados: `auditoria-storage`/`consultor-storage` (simulam a RPC versionada; asserções mantidas,
exceto "mesmo campo… prevalece o valor local", que codificava a sobrescrita silenciosa proibida —
substituído por conflito informado), `legacy-boundary` (FIN-09, finais de linha), fixture de banco
extraída para `financeiro-db-fixture.cjs`.

## Verificações manuais feitas
- Chromium (Playwright) com a página local, CDN servido dos pacotes npm e Supabase bloqueado:
  6 bibliotecas carregadas com SRI; modal de conflito com `role=dialog`, foco inicial, Tab preso e
  Escape, em 1366×800 e 390×844.
- SheetJS 0.18.5 real: leitura protegida sem falso positivo; zeros à esquerda, "1.234,56" e datas seriais preservados; CSV com `;`.

## Não executado (exige homologação com sessão real)
- Fluxo completo logado (salvar, conflito, fechamento de orçamento) contra um banco de homologação
  com as migrations aplicadas.
- `tests/browser/*.cjs` (dependem de sessão real).
- Boletos/carnês/remessas/retornos além de `npm run test:ailos`; exportação de inadimplência em
  arquivo real; teclado em todos os modais legados (só o modal novo foi verificado).
