-- Esforço travado: fora do Backlog o esforço não muda, EXCETO quando está
-- vazio (null/0). Antes a trava congelava o zero, e a Triagem exigia um
-- esforço que não dava para gravar. Preencher um vazio vira também o
-- esforco_inicial (a estimativa que vale para a análise).
create or replace function public.trg_esforco_travado()
 returns trigger
 language plpgsql
as $function$
declare
  grupo_backlog text[] := array['backlog', 'priorizado', 'em_definicao', 'escopo_definido'];
begin
  if old.subetapa = any (grupo_backlog) and old.esforco_inicial is null then
    -- Primeira saída do Backlog: guarda a estimativa que vale para a análise
    if not (new.subetapa = any (grupo_backlog)) and new.esforco_inicial is null then
      new.esforco_inicial := nullif(new.esforco, 0);
    end if;
  elsif coalesce(old.esforco, 0) = 0 and old.esforco_inicial is null then
    -- Saiu do Backlog sem estimativa: pode preencher uma vez
    if coalesce(new.esforco, 0) > 0 and not (new.subetapa = any (grupo_backlog)) then
      new.esforco_inicial := new.esforco;
    end if;
  else
    -- Já saiu do Backlog com estimativa: esforço não muda
    new.esforco := old.esforco;
    new.esforco_inicial := coalesce(old.esforco_inicial, new.esforco_inicial);
  end if;
  return new;
end;
$function$;
