-- 2026-05-12 · edit comment
-- Marca quando comentário foi editado pelo próprio autor (admin não edita, só apaga).
-- UI mostra "(editado)" inline; client-side bloqueia edição de SF/cliente.

alter table task_comments
  add column if not exists edited_em timestamptz;
