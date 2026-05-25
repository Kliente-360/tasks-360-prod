-- Kliente 360 — seed dos cadastros reais e tarefa inicial.
-- Roda depois de schema.sql. Idempotente: limpa e recria.

truncate tasks, projetos, pessoas, clientes restart identity cascade;

insert into clientes (nome) values
  ('Kliente 360'), ('Bodytech'), ('VB'), ('CTF'),
  ('Pão & Talho'), ('Multimais'), ('Aurora'), ('Indigo');

insert into pessoas (nome) values
  ('Felipe'), ('Henrique'), ('Jéssica'), ('João'),
  ('Elder'), ('Karen'), ('Drieli'), ('Fernando');

insert into projetos (cliente_id, nome)
select c.id, p.nome
from clientes c
join (values
  ('Kliente 360', 'Gestão Interna'),
  ('Bodytech',    'Sustentação BT'),
  ('VB',          'Sustentação VB'),
  ('CTF',         'Sustentação CTF'),
  ('Pão & Talho', 'Sustentação Pão'),
  ('Pão & Talho', 'ERP Pão'),
  ('Multimais',   'Sustentação Multimais'),
  ('Aurora',      'Sales Cloud Intercâmbios'),
  ('Indigo',      'Sales Cloud Estacionamentos')
) p(cliente_nome, nome) on c.nome = p.cliente_nome;

insert into tasks (titulo, cliente_id, projeto_id, pessoa_id, prioridade, esforco, prazo, status)
values (
  'Validar esta ferramenta e definir roadmap',
  (select id from clientes where nome = 'Kliente 360'),
  (select id from projetos where nome = 'Gestão Interna'),
  (select id from pessoas  where nome = 'Jéssica'),
  'P0', 4, '2026-05-31', 'backlog'
);
