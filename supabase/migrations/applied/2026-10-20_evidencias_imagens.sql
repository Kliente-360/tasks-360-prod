-- Evidências · imagens na conversa e na abertura de solicitação (out/2026)
--
-- · task_attachments.comment_id liga a imagem à mensagem (null = anexo solto
--   da task, ex.: aba Anexos do time ou imagem da nova solicitação)
-- · visibilidade da imagem segue a mensagem: trigger copia visivel_cliente
--   quando o time muda a visibilidade do comentário
-- · anexos soltos do time passam a nascer internos (default false). Os 288
--   existentes eram "visíveis" só no papel (o portal nunca exibia anexos):
--   ficam internos para não aparecerem de repente para o cliente
-- · cliente pode enviar imagem (tabela + storage) nas tasks da própria
--   empresa; bucket já aceita só jpeg/png/webp até 2 MB

alter table public.task_attachments
  add column if not exists comment_id uuid references public.task_comments(id) on delete cascade;
create index if not exists task_attachments_comment_idx on public.task_attachments (comment_id);

alter table public.task_attachments alter column visivel_cliente set default false;
update public.task_attachments set visivel_cliente = false where comment_id is null;

-- Imagem segue a visibilidade da mensagem
create or replace function public.trg_anexo_segue_comentario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visivel_cliente is distinct from old.visivel_cliente then
    update public.task_attachments
      set visivel_cliente = new.visivel_cliente
      where comment_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_anexo_segue_comentario on public.task_comments;
create trigger trg_anexo_segue_comentario
  after update of visivel_cliente on public.task_comments
  for each row execute function public.trg_anexo_segue_comentario();

-- Task que o cliente enxerga (mesma regra do select de tasks)
create or replace function public.app_cliente_ve_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks tk
    where tk.id = p_task_id
      and app_pessoa_role() = 'cliente'
      and tk.cliente_id = app_pessoa_cliente_id()
      and tk.visivel_cliente = true
      and not (tk.criado_por_ia is true and tk.triada_em is null)
  );
$$;
grant execute on function public.app_cliente_ve_task(uuid) to authenticated;

-- Tabela
drop policy if exists task_attachments_cliente_select on public.task_attachments;
create policy task_attachments_cliente_select on public.task_attachments
  for select using (visivel_cliente = true and app_cliente_ve_task(task_id));

drop policy if exists task_attachments_cliente_insert on public.task_attachments;
create policy task_attachments_cliente_insert on public.task_attachments
  for insert with check (
    app_cliente_ve_task(task_id)
    and visivel_cliente = true
    and author_pessoa_id = app_pessoa_id()
    and mime in ('image/jpeg', 'image/png', 'image/webp')
    and size_bytes <= 2097152
    and storage_path like task_id::text || '/%'
    and (comment_id is null or exists (
      select 1 from public.task_comments c
      where c.id = comment_id and c.task_id = task_attachments.task_id and c.from_cliente is true
    ))
  );

-- Storage (caminho = <task_id>/<arquivo>)
drop policy if exists task_attachments_cliente_read on storage.objects;
create policy task_attachments_cliente_read on storage.objects
  for select using (
    bucket_id = 'task-attachments'
    and exists (
      select 1 from public.task_attachments a
      where a.storage_path = objects.name and a.visivel_cliente = true and app_cliente_ve_task(a.task_id)
    )
  );

drop policy if exists task_attachments_cliente_upload on storage.objects;
create policy task_attachments_cliente_upload on storage.objects
  for insert with check (
    bucket_id = 'task-attachments'
    and app_cliente_ve_task((split_part(name, '/', 1))::uuid)
  );
