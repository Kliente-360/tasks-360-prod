-- Liga webhook_enabled para os clientes VB e CTF.
-- Ajuste os nomes conforme o cadastro real no banco.
update clientes
   set webhook_enabled = true
 where nome ilike '%vb%'
    or nome ilike '%ctf%';

-- Confirmar:
select id, nome, webhook_enabled from clientes where webhook_enabled = true;
