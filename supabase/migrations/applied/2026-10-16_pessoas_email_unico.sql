-- Um e-mail = uma pessoa (out/2026). Dois cadastros de cliente com o mesmo
-- gmail fizeram a sessão da Jessica cair no cliente errado (Bodytech em vez
-- de Pão e Talho): login, vínculo de user_id e app_pessoa_role() resolvem
-- a pessoa por e-mail/user_id com `limit 1`.
create unique index if not exists pessoas_email_unico
  on public.pessoas (lower(trim(email)))
  where coalesce(trim(email), '') <> '';
