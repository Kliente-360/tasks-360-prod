# AUDIT_RLS.md · Auditoria de segurança end-to-end

> **Sprint**: Bucket V · pré-launch Pão e Talho (jun/2026)
> **Item**: V.3 · RLS audit
> **Versão schema auditada**: snapshot `supabase/schema.sql` v1.03.151
> **Roles no app**: `admin` · `interno` · `cliente`

---

## 1. Helpers de auth (SECURITY DEFINER)

| Função | Retorna | Uso |
|---|---|---|
| `app_pessoa_id()` | uuid (pessoas.id do user logado) | usado em policies self-* |
| `app_pessoa_role()` | text ('admin' / 'interno' / 'cliente') | gate por role |
| `app_pessoa_cliente_id()` | uuid (pessoas.cliente_id) | isolar dados por cliente externo |
| `app_is_admin()` | boolean (`role = 'admin'`) | shortcut |
| `app_is_staff()` | boolean (`role in ('admin','interno')`) | shortcut |

Todas `STABLE SECURITY DEFINER` com `search_path = public` — protegidas contra schema-shadowing.

**OK** — base sólida.

---

## 2. Matriz role × tabela × CRUD

Legenda: ✅ permitido · ❌ negado · ⚠️ permitido com restrição · 🔴 GAP identificado

### 2.1 · `clientes`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ✅ tudo | ✅ | ✅ | ✅ |
| cliente | ⚠️ só próprio (`id = app_pessoa_cliente_id()`) | ❌ | ❌ | ❌ |

**OK** · isolamento por cliente_id correto.

### 2.2 · `projetos`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ✅ tudo | ✅ | ✅ | ✅ |
| cliente | ⚠️ só `cliente_id = app_pessoa_cliente_id()` | ❌ | ❌ | ❌ |

**OK** · cliente só vê projetos do seu cliente_id.

### 2.3 · `pessoas`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ✅ tudo | ✅ | ✅ | ✅ |
| cliente | ⚠️ **só self** (`user_id = auth.uid()`) | ❌ | ❌ | ❌ |

**🟡 Atenção UX** · cliente NÃO vê outros pessoas (nem staff atribuído à task, nem outros usuários do mesmo cliente). Frontend que faz JOIN no SELECT vai trazer responsável vazio → renderiza "—" ou quebra. **Não é vazamento; é UX-issue.** Possíveis fixes:
- (a) Policy adicional: cliente vê pessoas internas marcadas como `é_contato_visivel=true` (novo campo) — manter staff de operação privado, expor só "ponto focal"
- (b) Manter como está, frontend usa `task.responsavel_nome` denormalizado (precisa adicionar coluna ou hidratar via view)

**Recomendação V.4**: decidir como cliente vê "responsável" no modal modo cliente.

### 2.4 · `tasks`
Policies permissivas (OR entre si) + 1 restrictive (AND obrigatório):
| Policy | Tipo | Quem | Predicate |
|---|---|---|---|
| `tasks_admin_all` | permissive ALL | admin | tudo |
| `tasks_interno_non_kliente` | permissive ALL | interno | task em cliente `eh_interno=false` |
| `tasks_interno_owner` | permissive ALL | interno | `pessoa_id = app_pessoa_id()` (cobre Kliente 360) |
| `tasks_cliente_select` | permissive SELECT | cliente | `cliente_id = X AND visivel_cliente=true` |
| `task_privada_somente_dono` | **restrictive** SELECT | todos | `privada=false OR pessoa_id = dono` |

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ⚠️ tudo exceto Kliente 360 + suas próprias em Kliente; restrictive aplica privada | ⚠️ idem | ⚠️ idem | ⚠️ idem |
| cliente | ⚠️ só `cliente_id` próprio + `visivel_cliente=true` + (privada=false OR dono) | ❌ | ❌ | ❌ |

**OK** · combinação permissive+restrictive cobre privada corretamente. Cliente nunca atinge `privada=true` pois `pessoa_id != cliente`.

**🟡 Observação interno**: interno pode UPDATE/DELETE task de outro interno (em cliente não-Kliente). Decisão de design — staff colabora. Manter, mas vale flag em V.9.

### 2.5 · `task_comments`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ✅ tudo | ✅ | ✅ | ✅ |
| cliente | ⚠️ `visivel_cliente=true` no comment AND `visivel_cliente=true` na task | ⚠️ idem (força `visivel_cliente=true`) | ❌ | ❌ |

**OK** · duas camadas (task + comment). Cliente nunca vê comment interno.

### 2.6 · `task_attachments`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin/interno | ✅ tudo | ✅ | ✅ | ✅ |
| cliente | ⚠️ só anexos de task `visivel_cliente=true` no seu cliente_id | ❌ | ❌ | ❌ |

**🔴 GAP A** · cliente pode ler **qualquer anexo** de tasks visíveis — mesmo se o anexo for marcado internamente como "uso interno". Hoje a tabela **não tem flag** `visivel_cliente` no próprio anexo.

**Fix proposto**: adicionar `visivel_cliente boolean default true` em `task_attachments` + policy filtra `visivel_cliente=true`. Default `true` mantém comportamento atual. Anexos marcados como `false` ficam só staff.

**Severidade**: média. Não tem caso conhecido de anexo interno em task visível, mas é o tipo de coisa que vaza por engano (PDF de custo, planilha interna).

### 2.7 · `task_field_history`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin/interno | ✅ tudo | ✅ | — | — |
| cliente | ⚠️ histórico de task `visivel_cliente=true` no cliente_id próprio | ❌ | — | — |

**🔴 GAP B (CRÍTICO)** · cliente lê **histórico de TODOS os campos** da task — incluindo:
- `esforco` (interno · custo)
- `tempoRealHoras` (interno · horas)
- `pessoa_id` (responsável — pode trocar várias vezes)
- `status`/`subetapa` interna (pré-triagem, em_definicao etc · vaza fluxo interno)
- `criadoPorIA`, `privada`, etc

**Fix proposto** · 2 opções:
1. **Whitelist no policy** · cliente só lê field em (`status`, `prazo`, `titulo`, `descricao`, `solucao_implementada`). Validado contra valores reais em prod (jun/2026): só `status` e `prazo` aparecem hoje em histórico; os outros 3 ficam forward-compat caso adicionemos triggers no futuro.
2. **Coluna `visivel_cliente`** em `task_field_history` (default depende do field) + policy filtra

Recomendo **(1) whitelist** — mais simples, sem coluna nova, mais seguro por default (whitelist > blacklist).

**Severidade**: alta. É vazamento real de dados internos hoje.

### 2.8 · `time_entries`
| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ⚠️ só self (`pessoa_id = app_pessoa_id()`) | ⚠️ idem | ⚠️ idem | ⚠️ idem |
| cliente | ❌ **sem policy = deny** | ❌ | ❌ | ❌ |

**OK** · cliente não vê horas trabalhadas. Telas que SELECT em `time_entries` vão vir vazias pro cliente — confirmar que UI lida com isso (provavelmente não tem screen do cliente acessando essa tabela).

### 2.9 · `notifications`
Policies atuais:
| Policy | Tipo | Quem | Ação |
|---|---|---|---|
| `notifications_staff_all` | permissive ALL | staff | tudo |
| `notifications_insert_any` | permissive INSERT | qualquer authenticated | insere |
| `notifications_select_self` | permissive SELECT | dono | self |
| `notifications_self_select` | permissive SELECT | dono | **DUPLICADA** |
| `notifications_update_self` | permissive UPDATE | dono | self |

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| admin | ✅ tudo | ✅ | ✅ | ✅ |
| interno | ✅ **tudo (inclusive de outros internos)** | ✅ | ✅ | ❌ (sem delete policy) |
| cliente | ❌ **sem policy de role=cliente** = deny | ❌ idem | ❌ idem | ❌ |

**🔴 GAP C (CRÍTICO pro Bucket V)** · cliente NÃO recebe notificações via DB porque não há policy permitindo `role=cliente` selecionar próprias notif. **V.8 vai precisar adicionar isso.**

**🟡 GAP D** · `notifications_staff_all` permite interno A ver notif de interno B. Isso é intencional? Provavelmente drift histórico — interno mention/assigned é privado e não deveria vazar. **Recomendo apertar pra `self` apenas; admin mantém staff_all se precisar pra suporte.**

**🟡 GAP E** · `notifications_select_self` duplicada com `notifications_self_select` (mesmo predicate). Limpar.

### 2.10 · `webhook_config`
RLS habilitada **sem policy** → só `service_role` (Edge Functions) acessa. **OK** intencional.

---

## 3. Resumo de gaps

| # | Severidade | Tabela | Descrição | Fix |
|---|---|---|---|---|
| A | 🟡 Média | `task_attachments` | anexo interno em task visível vaza pro cliente | adicionar coluna `visivel_cliente` + policy filtra |
| **B** | 🔴 **Alta** | `task_field_history` | cliente lê histórico de `esforco`, `tempoRealHoras`, `pessoa_id`, status interno | whitelist field no policy |
| **C** | 🔴 **Alta** (Bucket V) | `notifications` | cliente não tem policy SELECT/UPDATE/INSERT — V.8 vai precisar | adicionar policies `cliente_self_*` |
| D | 🟡 Média | `notifications` | interno vê notif de outro interno via `staff_all` | apertar pra `app_is_admin()` + self-policies pra interno |
| E | 🟢 Baixa | `notifications` | policies `select_self` e `self_select` duplicadas | drop uma |
| F | 🟢 Baixa (UX) | `pessoas` | cliente não vê staff atribuído → UI mostra responsável vazio | resolver em V.4 (modal modo cliente · denormalizar nome) |

---

## 4. Fixes propostos · migration única

```sql
-- migration: 2026-06-15_rls_audit_v3.sql

-- ============================================================
-- GAP B · task_field_history · whitelist field pro cliente
-- ============================================================
drop policy if exists task_field_history_cliente_select on public.task_field_history;
create policy task_field_history_cliente_select on public.task_field_history
  for select using (
    app_pessoa_role() = 'cliente'
    AND field in ('titulo', 'descricao', 'prazo', 'status_macro', 'solucao_implementada', 'visivel_cliente')
    AND EXISTS (
      SELECT 1 FROM tasks tk
      WHERE tk.id = task_field_history.task_id
        AND tk.cliente_id = app_pessoa_cliente_id()
        AND tk.visivel_cliente = true
    )
  );

-- ============================================================
-- GAP A · task_attachments · coluna visivel_cliente
-- ============================================================
alter table public.task_attachments
  add column if not exists visivel_cliente boolean not null default true;

drop policy if exists task_attachments_cliente_select on public.task_attachments;
create policy task_attachments_cliente_select on public.task_attachments
  for select using (
    app_pessoa_role() = 'cliente'
    AND visivel_cliente = true
    AND EXISTS (
      SELECT 1 FROM tasks tk
      WHERE tk.id = task_attachments.task_id
        AND tk.cliente_id = app_pessoa_cliente_id()
        AND tk.visivel_cliente = true
    )
  );

-- ============================================================
-- GAP E · notifications · drop duplicada
-- ============================================================
drop policy if exists notifications_self_select on public.notifications;
-- mantém notifications_select_self (mesmo predicate)

-- ============================================================
-- GAP D · notifications · apertar staff_all pra admin-only
-- ============================================================
drop policy if exists notifications_staff_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all using (app_is_admin()) with check (app_is_admin());
-- interno passa a usar só select_self/update_self (já existem)

-- ============================================================
-- GAP C · notifications · habilita cliente self
-- (pré-req V.8 — cliente recebe sino + realtime)
-- ============================================================
create policy notifications_cliente_self_select on public.notifications
  for select using (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  );

create policy notifications_cliente_self_update on public.notifications
  for update using (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  ) with check (
    app_pessoa_role() = 'cliente'
    AND recipient_pessoa_id = app_pessoa_id()
  );
-- INSERT já é coberto por notifications_insert_any
```

---

## 5. Decisões pendentes pro Felipe

1. **GAP B (whitelist field)** · a lista `('titulo','descricao','prazo','status_macro','solucao_implementada','visivel_cliente')` está OK? Adicionar/remover algum campo?
2. **GAP A (anexo visivel_cliente)** · default `true` mantém retrocompat. OK?
3. **GAP D (notifications staff_all → admin-only)** · concorda em apertar? Interno deixa de ver notif de outro interno via DB direto.
4. **GAP F (pessoas · UX)** · resolver em V.4 (modal modo cliente) — não é fix de RLS.

Após aprovação, gero a migration e rodo no SQL Editor do dashboard.

---

## 6. Checklist V.9 (walkthrough final) · derivado desta auditoria

- [ ] Logar como `role=cliente` (Pão e Talho) e acessar URLs proibidas (/dashboard, /briefing, /triagem, /cadastros, /timesheet, /foco, /backlog, /calendario, /kanban) → esperar 403/redirect
- [ ] Tentar SELECT direto em `time_entries`, `task_field_history`, `task_comments` (visivel_cliente=false) via supabase-js → esperar array vazio
- [ ] Tentar UPDATE em task de outro cliente → esperar erro
- [ ] Tentar INSERT comment com `visivel_cliente=false` → esperar erro de policy
- [ ] Validar Portal mostra só dados do cliente próprio
- [ ] Validar modal de task em modo cliente (V.4 entregue) esconde esforco/horas/escopo/histórico interno
- [ ] Validar sino do header funciona pro cliente (V.8 entregue)
- [ ] Validar dark mode em todas as telas do cliente
- [ ] Validar mobile (Backlog + Portal + Modal)
