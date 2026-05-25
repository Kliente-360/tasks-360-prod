-- Reply 1-nível em task_comments.
-- Comentários top-level têm parent_id null. Replies têm parent_id apontando
-- pro comentário top-level. Treplica é proibida (trigger garante).

alter table task_comments
  add column if not exists parent_id uuid references task_comments(id) on delete cascade;

create index if not exists task_comments_parent_idx on task_comments(parent_id);

-- Trigger: replies não podem ter replies (máximo 1 nível).
create or replace function task_comments_no_nested_reply()
returns trigger as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from task_comments where id = new.parent_id and parent_id is not null) then
      raise exception 'replies cannot have replies (max 1 level of nesting)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_task_comments_no_nested_reply on task_comments;
create trigger trg_task_comments_no_nested_reply
  before insert or update on task_comments
  for each row execute function task_comments_no_nested_reply();
