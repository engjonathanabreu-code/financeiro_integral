# Integral Financeiro — V1 protótipo

Protótipo navegável do sistema financeiro da Integral. Esta versão usa dados locais de demonstração (localStorage), sem Supabase, OpenAI ou WhatsApp reais.

## Teste local

```bash
npm start
```

Acesse http://localhost:3000

## Usuários de demonstração

- Administrador: `admin@integral.local` / `integral2026`
- Funcionário: `funcionario@integral.local` / `integral2026`

## Deploy Vercel

Suba a pasta no GitHub e importe o repositório na Vercel, ou utilize a Vercel CLI.

## Escopo desta V1

- Login e perfis
- Dashboard
- Contas e boleto com alerta administrativo simulado
- Documentos fiscais com análise IA simulada
- Fluxo de caixa
- Orçamentos por setor
- Viagens e divergências simuladas
- Planejamento de receitas/despesas
- Relatórios
- Cadastros e Usuários
- Restrições visuais de perfil

Próxima fase: Supabase Auth/Postgres/Storage, OpenAI e WhatsApp server-side.
