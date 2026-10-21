# Design system — Financeiro Integral

Tokens em `public/financeiro-design-system.css` (`--ds-*`), redefinidos para o tema escuro em
`public/financeiro-theme-dark.css` (`html[data-theme="dark"]`). Componentes novos usam só tokens.

| Token | Uso |
|---|---|
| `--ds-primary`, `--ds-primary-soft` | ação principal, foco, hover |
| `--ds-surface`, `--ds-border`, `--ds-text`, `--ds-muted` | cartões, modais, textos |
| `--ds-success*`, `--ds-warning*`, `--ds-danger*`, `--ds-info*` | estados |
| `--ds-r-field`, `--ds-r-card` | raios |
| `--ds-shadow-card`, `--ds-shadow-modal`, `--ds-focus` | sombras e anel de foco |

Botões: `.btn` (primário), `.btn.ghost` (secundário), `.btn.small`. Modais: `.modal-backdrop > .modal`
com `.modal-head`, `.modal-body`, `.modal-foot`.

## Estado do salvamento (FIN-16) — `public/financeiro-sync-status.css`

Indicador `#financeSaveStatus` (`role="status"`, `aria-live="polite"`), canto inferior esquerdo
(largura total no celular):

| Estado | Texto | Cor | Ação |
|---|---|---|---|
| `salvando` | Salvando… | neutra | — |
| `salvo` | Salvo no servidor | sucesso; some após 2,5 s | — |
| `pendente` | Sem conexão: alterações guardadas neste navegador e enviadas ao reconectar | aviso | Tentar agora |
| `conflito` | Conflito: uma alteração sua não foi aplicada… | aviso | Revisar |
| `falha` | Falha ao salvar: a alteração continua guardada neste navegador | perigo | Tentar agora |

O aviso de erro permanente (`.fin-save-blocked`) não manda recarregar: oferece "Descartar minha
alteração" (volta à versão do servidor) e "Fechar aviso". Ao sair da página com envio pendente, o
navegador pede confirmação.

## Modais acessíveis

Padrão aplicado ao modal de conflitos e recomendado para novos modais: `role="dialog"`,
`aria-modal="true"`, `aria-labelledby` no título, foco no primeiro botão útil, Tab preso dentro do
modal, Escape fecha e devolve o foco ao elemento anterior. Os ≈45 modais legados ainda não seguem
esse padrão (FIN-16 parcial): a correção deve ser feita por módulo, com teste de teclado.
