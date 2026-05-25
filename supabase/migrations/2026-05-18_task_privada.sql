-- Tasks privadas: visíveis apenas ao dono (is_ceo = true na pessoa).
--
-- 1) Flag is_ceo em pessoas — só Felipe tem true.
-- 2) Flag privada em tasks — só CEO pode criar.
-- 3) RLS: task privada só visível pro pessoa_id dono.
--
-- ATIVAR PRA FELIPE:
--   update pessoas set is_ceo = true where email = 'felipe@kliente360.com';

-- 1) pessoas.is_ceo
alter table pessoas add column if not exists is_ceo boolean not null default false;

-- 2) tasks.privada
alter table tasks add column if not exists privada boolean not null default false;

-- 3) RLS — adiciona condição nas policies existentes de SELECT.
--    Abordagem: cria policy separada que bloqueia tasks privadas de outros.
--    "Pode ler se: não é privada OU é a minha task"
--    (as policies existentes já controlam o resto — admin vê tudo, cliente vê visivel_cliente etc.)
--    Usa OR nas policies existentes via nova policy restritiva.

-- Policy restritiva (RESTRICTIVE): se privada=true, só o dono lê.
-- Policies RESTRICTIVE combinam com AND com as permissivas existentes.
create policy "task_privada_somente_dono"
  on tasks
  as restrictive
  for select
  using (
    privada = false
    or pessoa_id = (
      select id from pessoas where user_id = auth.uid() limit 1
    )
  );
