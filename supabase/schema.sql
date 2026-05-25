-- Kliente 360 — backlog protótipo
-- Schema básico. Roda uma vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  criado_em  timestamptz not null default now()
);

create table if not exists pessoas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  criado_em  timestamptz not null default now()
);

create table if not exists projetos (
  id         uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  nome       text not null,
  criado_em  timestamptz not null default now()
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descricao   text not null default '',
  cliente_id  uuid references clientes(id) on delete restrict,
  projeto_id  uuid references projetos(id) on delete restrict,
  pessoa_id   uuid references pessoas(id)  on delete restrict,
  prioridade  text not null default 'P2' check (prioridade in ('P0','P1','P2','P3')),
  esforco     numeric not null default 0,
  prazo       date,
  status      text not null default 'backlog' check (status in ('backlog','andamento','bloqueado','concluido')),
  criado_em   timestamptz not null default now(),
  status_em   timestamptz not null default now()
);

create index if not exists tasks_status_idx   on tasks(status);
create index if not exists tasks_cliente_idx  on tasks(cliente_id);
create index if not exists projetos_cliente_idx on projetos(cliente_id);

-- RLS aberta (protótipo). Qualquer cliente com a anon key lê/escreve tudo.
-- Trocar por políticas reais quando entrar Onda 0 com auth.
alter table clientes enable row level security;
alter table pessoas  enable row level security;
alter table projetos enable row level security;
alter table tasks    enable row level security;

drop policy if exists prototipo_all on clientes;
drop policy if exists prototipo_all on pessoas;
drop policy if exists prototipo_all on projetos;
drop policy if exists prototipo_all on tasks;

create policy prototipo_all on clientes for all using (true) with check (true);
create policy prototipo_all on pessoas  for all using (true) with check (true);
create policy prototipo_all on projetos for all using (true) with check (true);
create policy prototipo_all on tasks    for all using (true) with check (true);
