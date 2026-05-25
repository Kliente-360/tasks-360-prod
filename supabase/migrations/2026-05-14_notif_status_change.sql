-- Notificações por tipo: adiciona kind 'status_change' ao check constraint.
-- Disparado quando o status (macro) de uma task atribuída a alguém muda por
-- ação de outra pessoa. Diferencia visualmente no sino da app.

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('mention', 'assigned', 'comment_on_my_task', 'cliente_respondeu', 'status_change', 'generico'));
