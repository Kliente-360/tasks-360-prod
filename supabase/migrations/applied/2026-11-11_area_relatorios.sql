-- Área técnica nova: Relatórios (análises, indicadores, dashboards).
-- Só troca a constraint; não atualiza linhas (não dispara webhook).
alter table public.tasks drop constraint if exists tasks_area_tecnica_check;
alter table public.tasks add constraint tasks_area_tecnica_check check (
  area_tecnica is null or area_tecnica in
    ('configuracao', 'automacao', 'canais_ia', 'marketing', 'integracao', 'frontend', 'consultoria', 'relatorios')
);
