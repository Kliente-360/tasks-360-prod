# Migrations

## `applied/` — patches já rodados

Histórico cronológico das mudanças no schema. **Não rodar de novo** em projetos onde já foram aplicados — alguns são idempotentes mas outros não.

Se for criar projeto Supabase do zero, rodar todos em ordem (próximo da ordem alfabética por enquanto, mas ler o cabeçalho de cada um pra dependências).

| Arquivo | Tema |
|---|---|
| `api_patch.sql` | Endpoints iniciais (campos extra em tasks) |
| `api_patch_comments.sql` | Tabela `task_comments` |
| `mvp_dados_patch.sql` | `author_pessoa_id` em comments |
| `comments_reply_patch.sql` | `parent_id` em comments + trigger anti-treplica |
| `tags_patch.sql` | `tags text[]` em tasks |
| `manual_order_patch.sql` | `ordem` em tasks |
| `auth_history_patch.sql` | `task_status_history` + `actor_pessoa_id` |
| `invited_at_patch.sql` | `invited_at` em pessoas (gating de convite) |
| `complexidade_patch.sql` | `complexidade` em tasks |
| `subetapa_patch.sql` | `subetapa` em tasks + trigger sync com `status` macro |
| `roles_portal_patch.sql` | `role` + `cliente_id` em pessoas; `visivel_cliente` + `from_cliente` em comments; `bloqueado_por` + `visivel_cliente` em tasks; RLS pra cliente externo |
| `2026-05-10_notifications.sql` | tabela `notifications` + RLS + realtime publication |
| `2026-05-10_heuristicas_onda_a.sql` | atributos Onda A: `tasks.tamanho` (deprecated, agora computado), `pessoas.cliente_principal/secundario/capacidade_horas_semana/skills`, `clientes.tier`, `projetos.sla_*`/`orcamento_horas` |
| `2026-05-10_arquivamento.sql` | `arquivado_em timestamptz` em `clientes` e `projetos` |
| `2026-05-10_heuristicas_onda_b.sql` | Onda B: `pessoas.senioridade`, `projetos.tipo`, `tasks.reopen_count` + trigger |
| `2026-05-10_heuristicas_onda_c.sql` | Onda C: `tasks.tipo_trabalho`, `tasks.tempo_real_horas`, tabela `task_dependencies` |
| `2026-05-10_task_field_history.sql` | Tabela `task_field_history` pra rastrear mudanças de campos não-status (prazo, esforço, responsável, etc) |
| `2026-05-11_usage_events.sql` | Tabela `usage_events` (telemetria de uso, retenção 90d via `fn_usage_events_cleanup`) + RLS (insert open authenticated, select admin) |
| `2026-05-11_cliente_tier_realign.sql` | Alinha `cliente.tier` ao vocabulário do app: `estrategico/recorrente/spot` (era `estrategico/regular/oportunidade`). Remap automático dos valores legados. |
| `2026-05-11_tier_v2_e_tipo_projeto.sql` | Vocabulário v2: `cliente.tier = estrategico/potencial/descoberta`; `projeto.tipo = sustentacao/projeto/discovery` (removeu `implantacao`). Remap automático. |
| `2026-05-11_arquivar_task.sql` | `tasks.arquivado_em timestamptz` + index parcial. Task arquivada some de listas/dashboards/heurísticas (preserva histórico). |
| `2026-05-12_rls_role_aware.sql` | RLS fechada role-aware (admin/interno/cliente); drop de `prototipo_all`; helpers `app_pessoa_role()`/`app_pessoa_cliente_id()`/`app_is_staff()`; RPC `app_link_current_user_to_pessoa()`. |

## Migrations na raiz de `migrations/` — aguardando mover

Migrations escritas e commitadas, ainda **não movidas** pra `applied/` (ficam soltas na raiz de `migrations/`). Após rodar no SQL Editor e confirmar OK, mover manualmente pra `applied/` — não há automação. Fluxo:

1. Criar `migrations/<data>_<descricao>.sql`
2. Cabeçalho do SQL deve listar premissas (idempotência, dependências, rollback)
3. Rodar no SQL Editor do projeto
4. Confirmar OK
5. Mover o arquivo pra `applied/` e commitar

Soltas hoje na raiz (verificar se já foram aplicadas no projeto antes de mover): `2026-05-12_comment_edit.sql`, `2026-05-12_pessoa_first_link.sql`, `2026-05-12_task_attachments.sql`, `2026-05-12_task_checklist.sql`, `2026-05-14_notif_status_change.sql`, `2026-05-14_cliente_dominios.sql` (`clientes.dominios text[]` + index GIN), `2026-05-14_task_criado_por_ia.sql` (`tasks.criado_por_ia boolean` + index parcial).

## Regras gerais

- **Idempotência sempre que possível** (`if not exists`, `drop ... if exists`).
- **Comentário no topo** explicando o quê e por quê.
- **Sem ALTER destrutivo sem rollback** — se for dropar coluna, anotar como reverter.
- Se um patch tem dependência (ex: precisa de outro rodado antes), comentar no topo.
