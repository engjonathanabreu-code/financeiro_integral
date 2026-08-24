-- Integral Financeiro - persistência de Contas/Pagamentos e controle de lembretes WhatsApp
-- Executar uma vez no SQL Editor do mesmo Supabase usado pelo ERP.

create extension if not exists pgcrypto;

create table if not exists public.financeiro_contas (
  id text primary key,
  nome text not null,
  fornecedor text,
  categoria text,
  setor text,
  matricula_cadastro text,
  recorrencia text,
  ativo boolean not null default true,
  dados jsonb not null default '{}'::jsonb,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financeiro_pagamentos (
  id text primary key,
  conta_id text not null references public.financeiro_contas(id) on delete cascade,
  vencimento date not null,
  valor numeric(14,2) not null default 0,
  status text not null default 'Pendente',
  forma_pagamento text,
  codigo_pagamento text,
  pago_em timestamptz,
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conta_id, vencimento)
);

create table if not exists public.financeiro_whatsapp_envios (
  id uuid primary key default gen_random_uuid(),
  pagamento_id text not null references public.financeiro_pagamentos(id) on delete cascade,
  destinatario text not null,
  vencimento date not null,
  status text not null default 'enviado',
  erro text,
  enviado_em timestamptz not null default now(),
  unique(pagamento_id, destinatario)
);

alter table public.financeiro_contas enable row level security;
alter table public.financeiro_pagamentos enable row level security;
alter table public.financeiro_whatsapp_envios enable row level security;

drop policy if exists "financeiro_contas_authenticated" on public.financeiro_contas;
create policy "financeiro_contas_authenticated" on public.financeiro_contas
  for all to authenticated using (true) with check (true);

drop policy if exists "financeiro_pagamentos_authenticated" on public.financeiro_pagamentos;
create policy "financeiro_pagamentos_authenticated" on public.financeiro_pagamentos
  for all to authenticated using (true) with check (true);

-- O histórico de envio é somente leitura para usuários logados; escrita fica para service_role do backend.
drop policy if exists "financeiro_whatsapp_envios_read" on public.financeiro_whatsapp_envios;
create policy "financeiro_whatsapp_envios_read" on public.financeiro_whatsapp_envios
  for select to authenticated using (true);

create index if not exists idx_financeiro_pagamentos_vencimento on public.financeiro_pagamentos(vencimento);
create index if not exists idx_financeiro_pagamentos_status on public.financeiro_pagamentos(status);
create index if not exists idx_financeiro_contas_matricula on public.financeiro_contas(matricula_cadastro);
