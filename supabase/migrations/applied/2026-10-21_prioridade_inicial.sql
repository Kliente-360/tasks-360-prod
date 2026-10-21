-- Prioridade inicial fixa (out/2026)
-- Quando o cliente não escolhia prioridade na abertura, o portal mostrava
-- como "inicial" a prioridade atual, que muda ao aceitar pedido de
-- prioridade. Agora tasks.prioridade_inicial guarda a primeira prioridade
-- interna (P0–P3) e não muda mais.

alter table public.tasks add column if not exists prioridade_inicial text;

create or replace function public.trg_prioridade_inicial()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.prioridade_inicial := coalesce(new.prioridade_inicial, nullif(new.prioridade, ''));
  elsif new.prioridade_inicial is distinct from old.prioridade_inicial then
    -- correção explícita do valor: respeita
    return new;
  elsif old.prioridade_inicial is null and nullif(new.prioridade, '') is not null then
    -- primeira vez que a task recebe prioridade (ex.: na triagem)
    new.prioridade_inicial := coalesce(nullif(old.prioridade, ''), new.prioridade);
  else
    new.prioridade_inicial := old.prioridade_inicial;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prioridade_inicial on public.tasks;
create trigger trg_prioridade_inicial
  before insert or update on public.tasks
  for each row execute function public.trg_prioridade_inicial();

-- Existentes: primeiro valor conhecido no histórico; sem histórico, a atual.
-- ATENÇÃO: update em tasks do Salesforce com webhook ligado dispara
-- task.updated (trigger webhook_task_update). A 1ª execução disparou 206
-- envios redundantes (21/10). Correções posteriores excluem essas tasks.
update public.tasks t set prioridade_inicial = coalesce(
  (select h.from_value from public.task_field_history h
    where h.task_id = t.id and h.field = 'prioridade' and nullif(h.from_value, '') is not null
    order by h.occurred_at limit 1),
  nullif(t.prioridade, '')
)
where t.prioridade_inicial is null;
