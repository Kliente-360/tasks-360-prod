-- Campos da task · revisão de nov/2026
--
-- 1. tasks.area_tecnica: escolha única e opcional, no lugar do escopo com
--    13 opções. Preenchida a partir do escopo antigo (a área mais específica
--    ganha; Sales/Service Cloud ficam implícitos e não viram área).
-- 2. Esforço travado: editável enquanto a task está no grupo Backlog
--    (backlog, priorizado, em_definicao, escopo_definido). Ao sair dele,
--    tasks.esforco_inicial guarda a estimativa e o esforço não muda mais.
--    O trigger mantém o valor anterior em vez de dar erro, para não quebrar
--    integrações (ingest-task, Salesforce) que reenviam o esforço.
--
-- ATENÇÃO (incidente 21/10): os preenchimentos abaixo excluem tasks do
-- Salesforce com webhook ligado; qualquer UPDATE nelas dispara task.updated.

alter table public.tasks add column if not exists area_tecnica text;
alter table public.tasks drop constraint if exists tasks_area_tecnica_check;
alter table public.tasks add constraint tasks_area_tecnica_check check (
  area_tecnica is null or area_tecnica in
    ('configuracao', 'automacao', 'canais_ia', 'marketing', 'integracao', 'frontend', 'consultoria')
);
alter table public.tasks add column if not exists esforco_inicial numeric;

-- Escopo antigo → área (mais específica primeiro)
create or replace function public.area_do_escopo(p_escopo text[])
returns text
language sql
immutable
as $$
  select case
    when p_escopo && array['LWC'] then 'frontend'
    when p_escopo && array['Integração'] then 'integracao'
    when p_escopo && array['Marketing Cloud'] then 'marketing'
    when p_escopo && array['WhatsApp', 'Bot', 'Agentforce'] then 'canais_ia'
    when p_escopo && array['Flow', 'Apex'] then 'automacao'
    when p_escopo && array['Consultoria', 'Arquitetura'] then 'consultoria'
    when p_escopo && array['Admin'] then 'configuracao'
    else null
  end;
$$;

create or replace function public.trg_esforco_travado()
returns trigger
language plpgsql
as $$
declare
  grupo_backlog text[] := array['backlog', 'priorizado', 'em_definicao', 'escopo_definido'];
begin
  if old.subetapa = any (grupo_backlog) then
    -- Saindo do Backlog: guarda a estimativa que vale para a análise
    if not (new.subetapa = any (grupo_backlog)) and new.esforco_inicial is null then
      new.esforco_inicial := nullif(new.esforco, 0);
    end if;
  else
    -- Fora do Backlog: o esforço não muda mais (mantém o valor anterior)
    new.esforco := old.esforco;
    new.esforco_inicial := coalesce(old.esforco_inicial, new.esforco_inicial);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_esforco_travado on public.tasks;
create trigger trg_esforco_travado
  before update on public.tasks
  for each row execute function public.trg_esforco_travado();

-- Preenchimentos (sem tasks do Salesforce com webhook ligado)
update public.tasks t
set area_tecnica = public.area_do_escopo(t.escopo)
where t.area_tecnica is null
  and public.area_do_escopo(t.escopo) is not null
  and not (coalesce(t.external_source, '') = 'salesforce' and t.external_id is not null
           and exists (select 1 from public.clientes c where c.id = t.cliente_id and c.webhook_enabled));

update public.tasks t
set esforco_inicial = nullif(t.esforco, 0)
where t.esforco_inicial is null
  and coalesce(t.esforco, 0) > 0
  and t.subetapa <> all (array['backlog', 'priorizado', 'em_definicao', 'escopo_definido'])
  and not (coalesce(t.external_source, '') = 'salesforce' and t.external_id is not null
           and exists (select 1 from public.clientes c where c.id = t.cliente_id and c.webhook_enabled));
