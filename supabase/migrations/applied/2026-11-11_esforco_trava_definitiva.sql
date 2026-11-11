-- Esforço trava de vez na primeira saída do Backlog (nov/2026)
--
-- Antes: voltar ao Backlog liberava a edição de novo. Agora, uma vez que a
-- task saiu do Backlog (esforco_inicial preenchido), o esforço não muda
-- mais, nem se ela voltar. Só altera a função; nenhuma linha é atualizada
-- (sem webhook do Salesforce).

create or replace function public.trg_esforco_travado()
returns trigger
language plpgsql
as $$
declare
  grupo_backlog text[] := array['backlog', 'priorizado', 'em_definicao', 'escopo_definido'];
begin
  if old.subetapa = any (grupo_backlog) and old.esforco_inicial is null then
    -- Primeira saída do Backlog: guarda a estimativa que vale para a análise
    if not (new.subetapa = any (grupo_backlog)) and new.esforco_inicial is null then
      new.esforco_inicial := nullif(new.esforco, 0);
    end if;
  else
    -- Já saiu do Backlog alguma vez (ou está fora dele): esforço não muda
    new.esforco := old.esforco;
    new.esforco_inicial := coalesce(old.esforco_inicial, new.esforco_inicial);
  end if;
  return new;
end;
$$;
