-- ============================================================
-- 2026-05-12_pessoa_first_link.sql
-- Fix: cliente recém-convidado não conseguia se auto-vincular
-- porque a RLS de `pessoas` exige `user_id = auth.uid()` mas o
-- user_id só é populado durante o primeiro login (chicken-and-egg).
--
-- Solução: função `security definer` que atomicamente:
--   1. Pega email do JWT (auth.email() / users)
--   2. Procura pessoa.email com case-insensitive match
--   3. Se pessoa.user_id é null → vincula com auth.uid()
--      Se pessoa.user_id já bate → ok, retorna
--      Senão → null (conflito, não vincula)
--   4. Retorna a linha (vista pela função, RLS bypassed) num set
--      mínimo de colunas seguras
--
-- A função roda como dono (security definer), então bypassa RLS.
-- O caller é o usuário autenticado (auth.uid() válido). Não há
-- vazamento: só retorna a pessoa cujo email == email do JWT.
--
-- Idempotente.
-- ============================================================

create or replace function app_link_current_user_to_pessoa()
returns table (
  id uuid,
  nome text,
  email text,
  user_id uuid,
  invited_at timestamptz,
  role text,
  cliente_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
  v_pessoa_id uuid;
  v_existing_user_id uuid;
begin
  if v_auth_uid is null then
    return;
  end if;

  -- email do JWT (preferir auth.users por confiabilidade)
  select lower(u.email) into v_auth_email
  from auth.users u where u.id = v_auth_uid;

  if v_auth_email is null then
    return;
  end if;

  -- encontra pessoa com email matching (case insensitive)
  select p.id, p.user_id into v_pessoa_id, v_existing_user_id
  from pessoas p
  where lower(p.email) = v_auth_email
  limit 1;

  if v_pessoa_id is null then
    return;  -- email não cadastrado
  end if;

  -- Vincula user_id se ainda não vinculado.
  -- Se já vinculado a outro user_id, NÃO sobrescreve (segurança).
  if v_existing_user_id is null then
    update pessoas set user_id = v_auth_uid where pessoas.id = v_pessoa_id;
  elsif v_existing_user_id <> v_auth_uid then
    return;  -- conflito: outro auth user já vinculado a essa pessoa
  end if;

  -- Retorna a linha (com user_id agora populado)
  return query
    select p.id, p.nome, p.email, p.user_id, p.invited_at, p.role, p.cliente_id
    from pessoas p where p.id = v_pessoa_id;
end$$;

revoke all on function app_link_current_user_to_pessoa() from public;
grant execute on function app_link_current_user_to_pessoa() to authenticated;
