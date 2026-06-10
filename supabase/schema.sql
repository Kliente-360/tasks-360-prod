-- ============================================================
-- Kliente 360 · tasks 360 · Schema canônico
-- ============================================================
--
-- Snapshot do estado vivo do banco gerado em 10/06/2026 (v1.03.141).
-- Source-of-truth para auditoria, cold-start de novo projeto Supabase,
-- e detecção de drift entre repo ↔ Dashboard.
--
-- Workflow:
--   • Mudanças NOVAS no banco ⇒ migration em supabase/migrations/<data>_<descr>.sql,
--     rodada no SQL Editor, depois movida pra supabase/migrations/applied/.
--   • Periodicamente (após N migrations ou antes de releases) atualizar
--     este schema.sql com novo snapshot via queries de pg_catalog.
--   • Histórico completo da fase pré-cleanup vive na tag git
--     `schema-pre-cleanup` (commit 4fec7e2).
--
-- Notas sobre o estado atual (observações da auditoria 10/06):
--   • notifications tem `notifications_staff_all` (qualquer staff full)
--     além das 3 self-policies — pode ser drift de algum patch antigo.
--     Avaliar consolidar.
--   • task_field_history está em supabase_realtime publication mas NÃO
--     tem replica identity full — payloads de UPDATE virão parciais
--     (mesmo bug que tasks tinha antes do fix de v1.03.138).
--   • webhook_config tem RLS habilitada sem nenhuma policy — só
--     service_role acessa (intencional: a tabela tem secret).
--
-- ============================================================

-- ─── 1. Extensions ─────────────────────────────────────────────
create extension if not exists pgcrypto;
-- pg_net (chamado por dispatch_webhook), supabase_vault, supabase_realtime
-- vêm pré-instaladas no Supabase, não precisam de declaração explícita.

-- ============================================================
-- 2. Tables
-- ============================================================

create table public.clientes (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  criado_em timestamp with time zone not null default now(),
  tier text,
  arquivado_em timestamp with time zone,
  eh_interno boolean not null default false,
  dominios text[] not null default '{}'::text[],
  webhook_enabled boolean not null default false,
  cor_portal text,
  cor_portal_texto text
);

create table public.notifications (
  id uuid not null default gen_random_uuid(),
  recipient_pessoa_id uuid not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  source_task_id uuid,
  source_comment_id uuid,
  criado_em timestamp with time zone not null default now(),
  read_at timestamp with time zone
);

create table public.pessoas (
  id uuid not null default gen_random_uuid(),
  nome text not null,
  criado_em timestamp with time zone not null default now(),
  email text,
  user_id uuid,
  invited_at timestamp with time zone,
  role text not null default 'interno'::text,
  cliente_id uuid,
  cliente_principal_id uuid,
  cliente_secundario_id uuid,
  capacidade_horas_semana integer not null default 40,
  skills text[] not null default '{}'::text[],
  senioridade text,
  is_ceo boolean not null default false,
  is_pm boolean not null default false
);

create table public.projetos (
  id uuid not null default gen_random_uuid(),
  cliente_id uuid not null,
  nome text not null,
  criado_em timestamp with time zone not null default now(),
  sla_resposta_horas integer,
  sla_entrega_dias integer,
  orcamento_horas integer,
  arquivado_em timestamp with time zone,
  tipo text
);

create table public.task_attachments (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  storage_path text not null,
  mime text not null,
  size_bytes integer not null,
  width integer,
  height integer,
  author_pessoa_id uuid,
  criado_em timestamp with time zone not null default now()
);

create table public.task_comments (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  external_source text,
  external_id text,
  author text,
  author_external_id text,
  body text not null,
  posted_em timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  parent_id uuid,
  author_pessoa_id uuid,
  visivel_cliente boolean not null default false,
  from_cliente boolean not null default false,
  edited_em timestamp with time zone,
  last_ingest_at timestamp with time zone
);

create table public.task_field_history (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  field text not null,
  from_value text,
  to_value text,
  actor_pessoa_id uuid,
  actor_source text not null default 'app'::text,
  occurred_at timestamp with time zone not null default now()
);

create table public.tasks (
  id uuid not null default gen_random_uuid(),
  titulo text not null,
  descricao text not null default ''::text,
  cliente_id uuid,
  projeto_id uuid,
  pessoa_id uuid,
  prioridade text not null default 'P2'::text,
  esforco numeric not null default 0,
  prazo date,
  status text not null default 'backlog'::text,
  criado_em timestamp with time zone not null default now(),
  status_em timestamp with time zone not null default now(),
  external_source text,
  external_id text,
  ordem double precision,
  tags text[] not null default '{}'::text[],
  complexidade text not null default 'media'::text,
  subetapa text not null default 'backlog'::text,
  subetapa_em timestamp with time zone,
  bloqueado_por text,
  visivel_cliente boolean not null default true,
  reopen_count integer not null default 0,
  tipo_trabalho text,
  tempo_real_horas numeric,
  arquivado_em timestamp with time zone,
  checklist jsonb not null default '[]'::jsonb,
  criado_por_ia boolean not null default false,
  privada boolean not null default false,
  last_ingest_at timestamp with time zone,
  webhook_sync_status text,
  webhook_sync_error text,
  escopo text[] not null default '{}'::text[],
  andamento_em timestamp with time zone,
  triada_em timestamp without time zone,
  triada_por uuid,
  motivo_arquivamento text
);

create table public.time_entries (
  id uuid not null default gen_random_uuid(),
  task_id uuid not null,
  pessoa_id uuid not null,
  started_at timestamp with time zone not null,
  ended_at timestamp with time zone,
  note text,
  criado_em timestamp with time zone not null default now()
);

create table public.webhook_config (
  id integer not null default 1,
  url text,
  secret text,
  enabled boolean not null default true
);

-- ============================================================
-- 3. Constraints (PK, FK, CHECK, UNIQUE)
-- ============================================================

-- clientes
alter table public.clientes add constraint clientes_pkey PRIMARY KEY (id);
alter table public.clientes add constraint clientes_tier_check
  CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['estrategico'::text, 'potencial'::text, 'descoberta'::text]))));
alter table public.clientes add constraint clientes_cor_portal_texto_check
  CHECK ((cor_portal_texto = ANY (ARRAY['light'::text, 'dark'::text])));

-- notifications
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_kind_check
  CHECK ((kind = ANY (ARRAY['mention'::text, 'assigned'::text, 'comment_on_my_task'::text, 'cliente_comentou'::text, 'cliente_respondeu'::text, 'status_change'::text, 'generico'::text])));
alter table public.notifications add constraint notifications_recipient_pessoa_id_fkey
  FOREIGN KEY (recipient_pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_source_comment_id_fkey
  FOREIGN KEY (source_comment_id) REFERENCES task_comments(id) ON DELETE CASCADE;
alter table public.notifications add constraint notifications_source_task_id_fkey
  FOREIGN KEY (source_task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- pessoas
alter table public.pessoas add constraint pessoas_pkey PRIMARY KEY (id);
alter table public.pessoas add constraint pessoas_role_check
  CHECK ((role = ANY (ARRAY['admin'::text, 'interno'::text, 'cliente'::text])));
alter table public.pessoas add constraint pessoas_senioridade_check
  CHECK (((senioridade IS NULL) OR (senioridade = ANY (ARRAY['junior'::text, 'pleno'::text, 'senior'::text, 'lead'::text]))));
alter table public.pessoas add constraint pessoas_user_id_key UNIQUE (user_id);
alter table public.pessoas add constraint pessoas_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.pessoas add constraint pessoas_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
alter table public.pessoas add constraint pessoas_cliente_principal_id_fkey
  FOREIGN KEY (cliente_principal_id) REFERENCES clientes(id) ON DELETE SET NULL;
alter table public.pessoas add constraint pessoas_cliente_secundario_id_fkey
  FOREIGN KEY (cliente_secundario_id) REFERENCES clientes(id) ON DELETE SET NULL;

-- projetos
alter table public.projetos add constraint projetos_pkey PRIMARY KEY (id);
alter table public.projetos add constraint projetos_tipo_check
  CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY['sustentacao'::text, 'projeto'::text, 'discovery'::text]))));
alter table public.projetos add constraint projetos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;

-- task_attachments
alter table public.task_attachments add constraint task_attachments_pkey PRIMARY KEY (id);
alter table public.task_attachments add constraint task_attachments_storage_path_key UNIQUE (storage_path);
alter table public.task_attachments add constraint task_attachments_author_pessoa_id_fkey
  FOREIGN KEY (author_pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;
alter table public.task_attachments add constraint task_attachments_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- task_comments
alter table public.task_comments add constraint task_comments_pkey PRIMARY KEY (id);
alter table public.task_comments add constraint task_comments_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table public.task_comments add constraint task_comments_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES task_comments(id) ON DELETE CASCADE;
alter table public.task_comments add constraint task_comments_author_pessoa_id_fkey
  FOREIGN KEY (author_pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- task_field_history
alter table public.task_field_history add constraint task_field_history_pkey PRIMARY KEY (id);
alter table public.task_field_history add constraint task_field_history_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
alter table public.task_field_history add constraint task_field_history_actor_pessoa_id_fkey
  FOREIGN KEY (actor_pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;

-- tasks
alter table public.tasks add constraint tasks_pkey PRIMARY KEY (id);
alter table public.tasks add constraint tasks_prioridade_check
  CHECK ((prioridade = ANY (ARRAY['P0'::text, 'P1'::text, 'P2'::text, 'P3'::text])));
alter table public.tasks add constraint tasks_status_check
  CHECK ((status = ANY (ARRAY['backlog'::text, 'andamento'::text, 'bloqueado'::text, 'concluido'::text])));
alter table public.tasks add constraint tasks_subetapa_check
  CHECK ((subetapa = ANY (ARRAY['backlog'::text, 'priorizado'::text, 'em_definicao'::text, 'escopo_definido'::text, 'em_desenvolvimento'::text, 'em_homologacao'::text, 'em_revisao'::text, 'pronto_producao'::text, 'em_implantacao'::text, 'bloqueado'::text, 'concluido'::text])));
alter table public.tasks add constraint tasks_complexidade_check
  CHECK ((complexidade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])));
alter table public.tasks add constraint tasks_bloqueado_por_check
  CHECK (((bloqueado_por IS NULL) OR (bloqueado_por = ANY (ARRAY['nos'::text, 'cliente'::text, 'terceiro'::text]))));
alter table public.tasks add constraint tasks_tipo_trabalho_check
  CHECK (((tipo_trabalho IS NULL) OR (tipo_trabalho = ANY (ARRAY['bug'::text, 'feature'::text, 'discovery'::text, 'manutencao'::text, 'admin'::text]))));
alter table public.tasks add constraint tasks_webhook_sync_status_check
  CHECK ((webhook_sync_status = ANY (ARRAY['synced'::text, 'error'::text])));
alter table public.tasks add constraint tasks_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
alter table public.tasks add constraint tasks_projeto_id_fkey
  FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE RESTRICT;
alter table public.tasks add constraint tasks_pessoa_id_fkey
  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE RESTRICT;
alter table public.tasks add constraint tasks_triada_por_fkey
  FOREIGN KEY (triada_por) REFERENCES pessoas(id);

-- time_entries
alter table public.time_entries add constraint time_entries_pkey PRIMARY KEY (id);
alter table public.time_entries add constraint time_entries_pessoa_id_fkey
  FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE;
alter table public.time_entries add constraint time_entries_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- webhook_config
alter table public.webhook_config add constraint webhook_config_pkey PRIMARY KEY (id);
alter table public.webhook_config add constraint webhook_config_id_check CHECK ((id = 1));

-- ============================================================
-- 4. Indexes
-- ============================================================

-- clientes
CREATE INDEX idx_clientes_arquivado_em ON public.clientes USING btree (arquivado_em);
CREATE INDEX idx_clientes_dominios     ON public.clientes USING gin (dominios);

-- notifications
CREATE INDEX notifications_recipient_idx ON public.notifications USING btree (recipient_pessoa_id, criado_em DESC);
CREATE INDEX notifications_unread_idx    ON public.notifications USING btree (recipient_pessoa_id) WHERE (read_at IS NULL);

-- pessoas
CREATE INDEX pessoas_cliente_id_idx          ON public.pessoas USING btree (cliente_id);
CREATE INDEX pessoas_cliente_principal_idx   ON public.pessoas USING btree (cliente_principal_id);
CREATE INDEX pessoas_cliente_secundario_idx  ON public.pessoas USING btree (cliente_secundario_id);
CREATE UNIQUE INDEX pessoas_email_uq         ON public.pessoas USING btree (lower(email)) WHERE (email IS NOT NULL);
CREATE INDEX pessoas_invited_idx             ON public.pessoas USING btree (invited_at) WHERE (invited_at IS NOT NULL);
CREATE INDEX pessoas_role_idx                ON public.pessoas USING btree (role);
CREATE INDEX pessoas_skills_idx              ON public.pessoas USING gin (skills);
CREATE INDEX pessoas_user_idx                ON public.pessoas USING btree (user_id);
-- pessoas_user_id_key index é criado automaticamente pelo UNIQUE constraint acima.

-- projetos
CREATE INDEX idx_projetos_arquivado_em ON public.projetos USING btree (arquivado_em);
CREATE INDEX projetos_cliente_idx      ON public.projetos USING btree (cliente_id);

-- task_attachments
CREATE INDEX task_attachments_created_idx ON public.task_attachments USING btree (criado_em);
CREATE INDEX task_attachments_task_idx    ON public.task_attachments USING btree (task_id);
-- task_attachments_storage_path_key index é criado automaticamente pelo UNIQUE constraint.

-- task_comments
CREATE INDEX task_comments_author_pessoa_idx    ON public.task_comments USING btree (author_pessoa_id);
CREATE UNIQUE INDEX task_comments_external_uq   ON public.task_comments USING btree (external_source, external_id) WHERE (external_source IS NOT NULL);
CREATE INDEX task_comments_parent_idx           ON public.task_comments USING btree (parent_id);
CREATE INDEX task_comments_task_idx             ON public.task_comments USING btree (task_id);
CREATE INDEX task_comments_visivel_cliente_idx  ON public.task_comments USING btree (visivel_cliente);

-- task_field_history
CREATE INDEX idx_task_field_hist_field ON public.task_field_history USING btree (field);
CREATE INDEX idx_task_field_hist_task  ON public.task_field_history USING btree (task_id, occurred_at DESC);

-- tasks
CREATE INDEX idx_tasks_arquivado_em       ON public.tasks USING btree (arquivado_em) WHERE (arquivado_em IS NOT NULL);
CREATE INDEX idx_tasks_complexidade       ON public.tasks USING btree (complexidade);
CREATE INDEX idx_tasks_criado_por_ia      ON public.tasks USING btree (criado_por_ia) WHERE (criado_por_ia = true);
CREATE INDEX idx_tasks_subetapa           ON public.tasks USING btree (subetapa);
CREATE INDEX tasks_bloqueado_por_idx      ON public.tasks USING btree (bloqueado_por);
CREATE INDEX tasks_cliente_idx            ON public.tasks USING btree (cliente_id);
CREATE INDEX tasks_escopo_idx             ON public.tasks USING gin (escopo);
CREATE INDEX tasks_external_source_idx    ON public.tasks USING btree (external_source);
CREATE UNIQUE INDEX tasks_external_uq     ON public.tasks USING btree (external_source, external_id) WHERE (external_source IS NOT NULL);
CREATE INDEX tasks_ordem_idx              ON public.tasks USING btree (ordem);
CREATE INDEX tasks_status_idx             ON public.tasks USING btree (status);
CREATE INDEX tasks_tags_gin               ON public.tasks USING gin (tags);
CREATE INDEX tasks_visivel_cliente_idx    ON public.tasks USING btree (visivel_cliente);

-- time_entries
CREATE UNIQUE INDEX time_entries_open_unique ON public.time_entries USING btree (pessoa_id) WHERE (ended_at IS NULL);
CREATE INDEX time_entries_pessoa_idx         ON public.time_entries USING btree (pessoa_id);
CREATE INDEX time_entries_started_idx        ON public.time_entries USING btree (started_at DESC);
CREATE INDEX time_entries_task_idx           ON public.time_entries USING btree (task_id);

-- ============================================================
-- 5. Functions
-- ============================================================

-- ─── 5.1 · auth/RLS helpers ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.app_pessoa_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from pessoas where user_id = auth.uid() limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.app_pessoa_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role from pessoas where user_id = auth.uid() limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.app_pessoa_cliente_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cliente_id from pessoas where user_id = auth.uid() limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.app_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(app_pessoa_role() = 'admin', false);
$function$;

CREATE OR REPLACE FUNCTION public.app_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(app_pessoa_role() in ('admin','interno'), false);
$function$;

CREATE OR REPLACE FUNCTION public.app_link_current_user_to_pessoa()
 RETURNS TABLE(id uuid, nome text, email text, user_id uuid, invited_at timestamp with time zone, role text, cliente_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_pessoa_id uuid;
  v_existing_user_id uuid;
begin
  if v_auth_uid is null then return; end if;
  select lower(u.email) into v_auth_email from auth.users u where u.id = v_auth_uid;
  if v_auth_email is null then return; end if;
  select p.id, p.user_id into v_pessoa_id, v_existing_user_id
  from pessoas p where lower(p.email) = v_auth_email limit 1;
  if v_pessoa_id is null then return; end if;
  if v_existing_user_id is null then
    update pessoas set user_id = v_auth_uid where pessoas.id = v_pessoa_id;
  elsif v_existing_user_id <> v_auth_uid then
    return;
  end if;
  return query select p.id, p.nome, p.email, p.user_id, p.invited_at, p.role, p.cliente_id
               from pessoas p where p.id = v_pessoa_id;
end$function$;

-- ─── 5.2 · Trigger helpers (tasks) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_bloqueado_por_on_unblock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.subetapa <> 'bloqueado' then
    new.bloqueado_por := null;
  end if;
  return new;
end$function$;

CREATE OR REPLACE FUNCTION public.fn_increment_reopen_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.status = 'concluido' and new.status is distinct from 'concluido' then
    new.reopen_count := coalesce(old.reopen_count, 0) + 1;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_task_status_from_subetapa()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.status := case new.subetapa
    when 'backlog'             then 'backlog'
    when 'priorizado'          then 'backlog'
    when 'em_definicao'        then 'backlog'
    when 'escopo_definido'     then 'backlog'
    when 'em_desenvolvimento'  then 'andamento'
    when 'em_homologacao'      then 'andamento'
    when 'em_revisao'          then 'andamento'
    when 'pronto_producao'     then 'andamento'
    when 'em_implantacao'      then 'andamento'
    when 'bloqueado'           then 'bloqueado'
    when 'concluido'           then 'concluido'
  end;
  return new;
end$function$;

-- ─── 5.3 · Trigger helpers (task_comments) ─────────────────────

CREATE OR REPLACE FUNCTION public.task_comments_no_nested_reply()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.parent_id is not null then
    if exists (select 1 from task_comments where id = new.parent_id and parent_id is not null) then
      raise exception 'replies cannot have replies (max 1 level of nesting)';
    end if;
  end if;
  return new;
end;
$function$;

-- ─── 5.4 · Salesforce webhook · dispatch ────────────────────────

CREATE OR REPLACE FUNCTION public.dispatch_webhook(event_type text, top_level jsonb, data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cfg     webhook_config;
  payload jsonb;
begin
  select * into cfg from webhook_config where id = 1;
  if cfg.url is null or cfg.enabled is not true then
    return;
  end if;

  -- Envelope base + top-level mergeado + data aninhado.
  payload := jsonb_build_object(
    'event',   event_type,
    'sent_at', now()
  ) || coalesce(top_level, '{}'::jsonb) || jsonb_build_object('data', coalesce(data, '{}'::jsonb));

  perform net.http_post(
    url     := cfg.url,
    body    := payload,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || coalesce(cfg.secret, '')
               )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_webhook_task_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  is_enabled boolean;
begin
  -- Anti-loop: external_id ou webhook_sync_status mudaram → veio do
  -- próprio callback do dispatch-webhook. Pula.
  if NEW.external_id is distinct from OLD.external_id then return NEW; end if;
  if NEW.webhook_sync_status is distinct from OLD.webhook_sync_status then return NEW; end if;

  -- Só dispara pra tasks que vieram do Salesforce
  if NEW.external_source = 'salesforce' and NEW.external_id is not null then
    -- Gate por cliente: VB/CTF têm webhook_enabled=true; demais ignoram
    select webhook_enabled into is_enabled from clientes where id = NEW.cliente_id;
    if not coalesce(is_enabled, false) then
      return NEW;
    end if;

    begin
      -- Contrato v2: identificadores top_level + dados no data.
      perform dispatch_webhook(
        'task.updated',
        jsonb_build_object('task_id', NEW.id),
        jsonb_build_object(
          'task_external_id', NEW.external_id,
          'external_source',  NEW.external_source,
          'record',           to_jsonb(NEW),
          'old_record',       to_jsonb(OLD)
        )
      );
    exception when others then
      update tasks set webhook_sync_status = 'error', webhook_sync_error = sqlerrm
       where id = NEW.id;
    end;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_webhook_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  t          record;
  evt        text;
  is_enabled boolean;
  parent_ext text;
begin
  -- Anti-loop: external_id mudou (callback do dispatch setou)
  if TG_OP = 'UPDATE' and NEW.external_id is distinct from OLD.external_id then
    return NEW;
  end if;

  -- Gate 1: visivel_cliente = true · comments internos não integram com SF
  if not coalesce(NEW.visivel_cliente, false) then
    return NEW;
  end if;

  -- Gate 2: task originada do Salesforce
  select id, cliente_id, external_source, external_id into t
    from tasks where id = NEW.task_id;

  if t.external_source is distinct from 'salesforce' or t.external_id is null then
    return NEW;
  end if;

  -- Gate 3: cliente com webhook_enabled (VB/CTF apenas)
  select webhook_enabled into is_enabled from clientes where id = t.cliente_id;
  if not coalesce(is_enabled, false) then
    return NEW;
  end if;

  evt := case
    when TG_OP = 'INSERT' and NEW.parent_id is not null then 'reply.created'
    when TG_OP = 'INSERT' then 'comment.created'
    when TG_OP = 'UPDATE' and NEW.parent_id is not null then 'reply.updated'
    else 'comment.updated'
  end;

  -- Lookup parent_external_id pra reply (edge function precisa receber
  -- o external_id do comment pai, não o uuid interno).
  parent_ext := null;
  if NEW.parent_id is not null then
    select external_id into parent_ext from task_comments where id = NEW.parent_id;
  end if;

  begin
    -- Contrato v2: identificadores top_level + dados no data.
    perform dispatch_webhook(
      evt,
      jsonb_build_object(
        'task_id',    NEW.task_id,
        'comment_id', NEW.id,
        'is_reply',   NEW.parent_id is not null
      ),
      jsonb_build_object(
        'task_external_id',    t.external_id,
        'comment_external_id', NEW.external_id,
        'parent_id',           NEW.parent_id,
        'parent_external_id',  parent_ext,
        'external_source',     t.external_source,
        'record',              to_jsonb(NEW),
        'old_record',          case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end
      )
    );
  exception when others then
    null; -- webhook nunca bloqueia operação do usuário
  end;
  return NEW;
end;
$function$;

-- ============================================================
-- 6. Triggers
-- ============================================================

-- tasks
CREATE TRIGGER trg_clear_bloqueado_por
  BEFORE INSERT OR UPDATE OF subetapa ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION clear_bloqueado_por_on_unblock();

CREATE TRIGGER trg_reopen_count
  BEFORE UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION fn_increment_reopen_count();

CREATE TRIGGER trg_sync_task_status
  BEFORE INSERT OR UPDATE OF subetapa ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION sync_task_status_from_subetapa();

CREATE TRIGGER webhook_task_update
  AFTER UPDATE ON public.tasks
  FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*))
  EXECUTE FUNCTION trg_webhook_task_update();

-- task_comments
CREATE TRIGGER trg_task_comments_no_nested_reply
  BEFORE INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION task_comments_no_nested_reply();

CREATE TRIGGER webhook_comment
  AFTER INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION trg_webhook_comment();

-- ============================================================
-- 7. RLS · enable + policies
-- ============================================================

alter table public.clientes           enable row level security;
alter table public.notifications      enable row level security;
alter table public.pessoas            enable row level security;
alter table public.projetos           enable row level security;
alter table public.task_attachments   enable row level security;
alter table public.task_comments      enable row level security;
alter table public.task_field_history enable row level security;
alter table public.tasks              enable row level security;
alter table public.time_entries       enable row level security;
alter table public.webhook_config     enable row level security;

-- clientes
create policy clientes_staff_all on public.clientes
  for all using (app_is_staff()) with check (app_is_staff());
create policy clientes_cliente_self on public.clientes
  for select using (((app_pessoa_role() = 'cliente'::text) AND (id = app_pessoa_cliente_id())));

-- notifications · ATENÇÃO: tem permissive staff_all + 3 self-policies (drift?)
create policy notifications_staff_all on public.notifications
  for all using (app_is_staff()) with check (app_is_staff());
create policy notifications_insert_any on public.notifications
  for insert with check ((auth.uid() IS NOT NULL));
create policy notifications_select_self on public.notifications
  for select using ((recipient_pessoa_id = app_pessoa_id()));
-- notifications_self_select é duplicada de notifications_select_self (mesmo predicate).
-- Manter por enquanto pra refletir estado vivo; consolidar em migration futura.
create policy notifications_self_select on public.notifications
  for select using ((recipient_pessoa_id = app_pessoa_id()));
create policy notifications_update_self on public.notifications
  for update using ((recipient_pessoa_id = app_pessoa_id()))
  with check ((recipient_pessoa_id = app_pessoa_id()));

-- pessoas
create policy pessoas_staff_all on public.pessoas
  for all using (app_is_staff()) with check (app_is_staff());
create policy pessoas_cliente_self on public.pessoas
  for select using (((app_pessoa_role() = 'cliente'::text) AND (user_id = auth.uid())));

-- projetos
create policy projetos_staff_all on public.projetos
  for all using (app_is_staff()) with check (app_is_staff());
create policy projetos_cliente_select on public.projetos
  for select using (((app_pessoa_role() = 'cliente'::text) AND (cliente_id = app_pessoa_cliente_id())));

-- task_attachments
create policy task_attachments_staff_all on public.task_attachments
  for all using (app_is_staff()) with check (app_is_staff());
create policy task_attachments_cliente_select on public.task_attachments
  for select using (((app_pessoa_role() = 'cliente'::text) AND (EXISTS (
    SELECT 1 FROM tasks tk
    WHERE ((tk.id = task_attachments.task_id) AND (tk.cliente_id = app_pessoa_cliente_id()) AND (tk.visivel_cliente = true))
  ))));

-- task_comments
create policy task_comments_staff_all on public.task_comments
  for all using (app_is_staff()) with check (app_is_staff());
create policy task_comments_cliente_select on public.task_comments
  for select using (((app_pessoa_role() = 'cliente'::text) AND (visivel_cliente = true) AND (EXISTS (
    SELECT 1 FROM tasks tk
    WHERE ((tk.id = task_comments.task_id) AND (tk.cliente_id = app_pessoa_cliente_id()) AND (tk.visivel_cliente = true))
  ))));
create policy task_comments_cliente_insert on public.task_comments
  for insert with check (((app_pessoa_role() = 'cliente'::text) AND (visivel_cliente = true) AND (EXISTS (
    SELECT 1 FROM tasks tk
    WHERE ((tk.id = task_comments.task_id) AND (tk.cliente_id = app_pessoa_cliente_id()) AND (tk.visivel_cliente = true))
  ))));

-- task_field_history
create policy task_field_history_staff_all on public.task_field_history
  for all using (app_is_staff()) with check (app_is_staff());
create policy task_field_history_cliente_select on public.task_field_history
  for select using (((app_pessoa_role() = 'cliente'::text) AND (EXISTS (
    SELECT 1 FROM tasks tk
    WHERE ((tk.id = task_field_history.task_id) AND (tk.cliente_id = app_pessoa_cliente_id()) AND (tk.visivel_cliente = true))
  ))));

-- tasks · permissivas em camadas + restrictive de privada
create policy tasks_admin_all on public.tasks
  for all using (app_is_admin()) with check (app_is_admin());
create policy tasks_interno_non_kliente on public.tasks
  for all using (((app_pessoa_role() = 'interno'::text) AND (EXISTS (
    SELECT 1 FROM clientes c WHERE ((c.id = tasks.cliente_id) AND (c.eh_interno = false))
  ))))
  with check (((app_pessoa_role() = 'interno'::text) AND (EXISTS (
    SELECT 1 FROM clientes c WHERE ((c.id = tasks.cliente_id) AND (c.eh_interno = false))
  ))));
create policy tasks_interno_owner on public.tasks
  for all using (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())))
  with check (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())));
create policy tasks_cliente_select on public.tasks
  for select using (((app_pessoa_role() = 'cliente'::text) AND (cliente_id = app_pessoa_cliente_id()) AND (visivel_cliente = true)));

create policy task_privada_somente_dono on public.tasks as restrictive
  for select using (((privada = false) OR (pessoa_id = (
    SELECT pessoas.id FROM pessoas WHERE (pessoas.user_id = auth.uid()) LIMIT 1
  ))));

-- time_entries · admin full + self CRUD pra interno
create policy time_entries_admin_all on public.time_entries
  for all using ((app_pessoa_role() = 'admin'::text)) with check ((app_pessoa_role() = 'admin'::text));
create policy time_entries_self_select on public.time_entries
  for select using (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())));
create policy time_entries_self_insert on public.time_entries
  for insert with check (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())));
create policy time_entries_self_update on public.time_entries
  for update using (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())))
  with check (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())));
create policy time_entries_self_delete on public.time_entries
  for delete using (((app_pessoa_role() = 'interno'::text) AND (pessoa_id = app_pessoa_id())));

-- webhook_config · sem policy = só service_role acessa (intencional).

-- ============================================================
-- 8. Replica identity FULL (realtime envia row inteira em UPDATE/DELETE)
-- ============================================================

alter table public.clientes      replica identity full;
alter table public.notifications replica identity full;
alter table public.pessoas       replica identity full;
alter table public.projetos      replica identity full;
alter table public.task_comments replica identity full;
alter table public.tasks         replica identity full;
-- ATENÇÃO: task_field_history está em supabase_realtime publication
-- mas NÃO tem replica identity full · payloads de UPDATE virão parciais.
-- Avaliar adicionar em migration futura se houver consumidor realtime.

-- ============================================================
-- 9. Publications (realtime)
-- ============================================================

alter publication supabase_realtime add table public.clientes;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.pessoas;
alter publication supabase_realtime add table public.projetos;
alter publication supabase_realtime add table public.task_comments;
alter publication supabase_realtime add table public.task_field_history;
alter publication supabase_realtime add table public.tasks;
