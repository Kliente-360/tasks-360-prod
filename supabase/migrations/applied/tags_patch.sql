-- Tags / etiquetas em tasks. Array de texto pra simplicidade.
-- Tags são normalizadas em lowercase no app.

alter table tasks add column if not exists tags text[] not null default '{}';
create index if not exists tasks_tags_gin on tasks using gin(tags);
