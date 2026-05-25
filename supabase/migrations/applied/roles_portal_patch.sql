-- ============================================================
-- roles_portal_patch.sql
-- Adiciona estrutura para roles (admin/interno/cliente) e Portal
-- do cliente (Pão e Talho como piloto).
--
-- Idempotente. Roda no SQL Editor do Supabase.
-- ============================================================

-- 1) Roles em pessoas.
alter table pessoas
  add column if not exists role text not null default 'interno';

alter table pessoas drop constraint if exists pessoas_role_check;
alter table pessoas add constraint pessoas_role_check
  check (role in ('admin','interno','cliente'));

alter table pessoas
  add column if not exists cliente_id uuid references clientes(id) on delete set null;

create index if not exists pessoas_role_idx on pessoas(role);
create index if not exists pessoas_cliente_id_idx on pessoas(cliente_id);

-- 2) Visibilidade de comments e marker "veio do cliente".
alter table task_comments
  add column if not exists visivel_cliente boolean not null default false;
alter table task_comments
  add column if not exists from_cliente boolean not null default false;

create index if not exists task_comments_visivel_cliente_idx on task_comments(visivel_cliente);

-- 3) Tasks: bloqueado_por (causa do bloqueio) e visivel_cliente.
alter table tasks
  add column if not exists bloqueado_por text;
alter table tasks drop constraint if exists tasks_bloqueado_por_check;
alter table tasks add constraint tasks_bloqueado_por_check
  check (bloqueado_por is null or bloqueado_por in ('nos','cliente','terceiro'));

alter table tasks
  add column if not exists visivel_cliente boolean not null default true;

create index if not exists tasks_bloqueado_por_idx on tasks(bloqueado_por);
create index if not exists tasks_visivel_cliente_idx on tasks(visivel_cliente);

-- 4) RLS apertada SOMENTE para role='cliente'.
--
-- Pre-requisito de Fase 2 (depois do auth voltar): a coluna pessoas.user_id
-- precisa estar populada via auth_history_patch (já rodado).
--
-- Por enquanto a policy 'prototipo_all' continua valendo pra todo mundo;
-- só adicionamos uma policy ADICIONAL que NEGA leitura cruzada de tasks
-- pra users autenticados com role=cliente. Como o protótipo ainda usa
-- anon key (sem auth.uid()), essa policy não restringe nada hoje;
-- ativa naturalmente quando auth voltar.

-- Tasks: cliente só vê tasks do próprio cliente_id e visíveis.
drop policy if exists cliente_only_own_tasks on tasks;
create policy cliente_only_own_tasks on tasks
  for select
  using (
    -- Pula a checagem se auth.uid() é null (anon key — protótipo) ou se
    -- pessoa logada NÃO é cliente.
    coalesce(
      (select role from pessoas where user_id = auth.uid()) <> 'cliente',
      true
    )
    or (
      visivel_cliente = true
      and cliente_id = (
        select cliente_id from pessoas where user_id = auth.uid() limit 1
      )
    )
  );

-- Comments: cliente só vê comments visivel_cliente=true em tasks que ele
-- também enxerga. (Reaproveita a regra do select de tasks.)
drop policy if exists cliente_only_visivel_comments on task_comments;
create policy cliente_only_visivel_comments on task_comments
  for select
  using (
    coalesce(
      (select role from pessoas where user_id = auth.uid()) <> 'cliente',
      true
    )
    or visivel_cliente = true
  );

-- (As policies `prototipo_all` continuam ativas como fallback enquanto
-- não temos políticas WRITE específicas pra cliente. Quando rebuild
-- Onda 0 acontecer, consolidar.)

-- 5) Boa prática: tornar tasks.bloqueado_por consistente com subetapa.
-- Quando subetapa SAIR de 'bloqueado', limpar bloqueado_por automaticamente.
create or replace function clear_bloqueado_por_on_unblock()
returns trigger language plpgsql as $$
begin
  if new.subetapa <> 'bloqueado' then
    new.bloqueado_por := null;
  end if;
  return new;
end$$;

drop trigger if exists trg_clear_bloqueado_por on tasks;
create trigger trg_clear_bloqueado_por
  before insert or update of subetapa on tasks
  for each row execute function clear_bloqueado_por_on_unblock();
