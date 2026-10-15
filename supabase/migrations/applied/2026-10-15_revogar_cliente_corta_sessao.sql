-- Revogar acesso de cliente passa a cortar sessões já abertas (out/2026)
--
-- Com sessão longa (refresh token sem limite), "Revogar acesso" no cadastro
-- (invited_at = null) só impedia um NOVO login. Quem já estava logado seguia
-- lendo dados, porque as políticas RLS dependem de app_pessoa_role() e ela
-- não olhava invited_at.
--
-- Agora, para role 'cliente', a função devolve null quando o acesso foi
-- revogado ou quando a empresa (clientes) está arquivada. Todas as políticas
-- de cliente deixam de casar na hora. Staff (admin/interno) não muda.

create or replace function public.app_pessoa_role()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when p.role = 'cliente'
         and (p.invited_at is null
              or exists (select 1 from clientes c
                          where c.id = p.cliente_id and c.arquivado_em is not null))
      then null
    else p.role
  end
  from pessoas p
  where p.user_id = auth.uid()
  limit 1;
$function$;
