-- Instrumentação mínima pra medir adoção (critério 1 do roadmap):
-- author_pessoa_id em task_comments pra ligar comentário ao usuário do app.
-- Comentários do Salesforce continuam usando 'author' (texto livre) e
-- author_external_id; author_pessoa_id fica null neles.

alter table task_comments
  add column if not exists author_pessoa_id uuid references pessoas(id) on delete set null;

create index if not exists task_comments_author_pessoa_idx on task_comments(author_pessoa_id);
