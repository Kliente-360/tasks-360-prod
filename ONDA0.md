# Onda 0 — Plano de migração de stack

> **Status: ✅ feature-complete · paridade auditada · cutover parqueado · v1.02.186** (mai/2026)
>
> Todos os blocos 1-4.J entregues. Branch ativa `feat/onda-0` em preview Vercel. Time validando em preview antes do cutover. **Bloco 5 (cutover do domínio principal) está parqueado — será executado manualmente quando o responsável sinalizar.**
>
> **Roadmap pós-Onda 0** (próximas ondas, IA, time tracking, Portal cliente, etc.): ver **`ROADMAP.md` §9.3 · Roadmap pós-Onda 0**.
>
> Este documento é o **plano original + captação de decisões arquiteturais** da migração. Mantido como referência histórica; status table atualizada no fim.

---

## Objetivo

Migrar o app Alpine.js (`index.html` + `lib/`) para Next.js 15 + Drizzle + Supabase,
**mantendo funcionalidade e UX 100% idênticas ao app atual.**
Sem melhorias, sem novas features — apenas trocar a fundação.

Os ganhos reais da migração:
- TypeScript (pega bugs antes de chegar ao usuário)
- Drizzle (queries tipadas, sem SQL inline em componente)
- Componentes reutilizáveis (não sustenta 2+ devs em single-file)
- Melhor bundling e Vercel edge
- Base pra escalar

---

## Decisão central: arquitetura híbrida

**Não é "tudo em Server Component".** O app tem duas categorias de tela bem distintas:

### Categoria A — Server Component + Server Actions

Telas read-heavy, baixa interatividade, mutações simples (formulários).

| Tela | Razão |
|---|---|
| Cadastros (clientes, projetos, pessoas) | Listas com arquivar/editar — já implementado |
| Rotas de auth (login, magic link) | Sem estado reativo |

Padrão: `page.tsx` como Server Component, busca dados com Drizzle diretamente,
mutações via Server Actions com `revalidatePath`.

### Categoria B — Client Component com Supabase JS

Telas com filtros instantâneos, realtime, drag-and-drop, modais com autosave.
**Essas telas replicam o padrão do Alpine: dados carregados no boot, filtros em memória.**

| Tela | Interatividade que exige client |
|---|---|
| Backlog | Filtros encadeados, sort multi-coluna, bulk actions, DnD manual, realtime |
| Kanban | DnD entre colunas, filtros, realtime |
| Modal de task | Autosave debounced, thread de comentários, checklist |
| Triagem | Filtros, bulk triage |
| Meu Foco | Filtros por pessoa, grupos dinâmicos |
| Calendário | Navegação de mês, click em dia, mini-modal |
| Command Palette | Estado local, busca fuzzy em memória |

Padrão: `page.tsx` é um shell Server Component leve (só metadata/layout),
o componente pesado abaixo é `'use client'` e carrega dados via Supabase JS client,
igual ao app Alpine hoje.

---

## Por que não Server Actions nas telas interativas

O usuário já sentiu a latência no Cadastros. Para telas como Backlog:

- Cada clique em filtro = round-trip ao servidor = UX degradada
- Sort/filtro em memória no Alpine é instantâneo — perder isso é regressão
- Realtime via Supabase JS não funciona em Server Components
- Autosave debounced (800ms) precisa de estado local no cliente

Regra prática: **se a tela tem mais de 1 interação por segundo em uso normal, é Client Component.**

---

## Padrão de dados para Client Components

O Alpine carrega tudo no boot e filtra client-side. Manter esse padrão:

```typescript
// Em Client Components pesados (Backlog, Kanban, etc.)
// Supabase JS client — mesmo que o Alpine usa hoje
import { createClient } from '@/lib/supabase/client'

// Boot: carrega tasks + clientes + projetos + pessoas
// Filtra/ordena em memória com os mesmos helpers de lib/helpers.js
// Realtime: assina canal tasks e aplica delta local (igual ao Alpine)
```

Os helpers de `lib/helpers.js` já estão em `src/lib/task-utils.ts` (portados).
`effEsforco`, `triageFailures`, `bucketTasksByWeek`, etc. — mesma lógica, só TypeScript.

---

## Realtime

**Decisão (Bloco 2.1):** Realtime fica conectado em **dormente** durante
toda a Onda 0. Refresh é manual — clicar na logo do AppNav (ou no botão
"↻ recarregar" da página) dispara `refreshAll()`. Mesmo padrão do app
Alpine em produção hoje.

Motivo: a publication `supabase_realtime` do projeto não inclui as 4
tabelas (`tasks`, `clientes`, `projetos`, `pessoas`). O `supabase/realtime.sql`
está no repo mas nunca foi executado. Habilitar agora exige também
`replica identity full` em `tasks` pra o payload do UPDATE chegar
completo — caso contrário a delta-apply quebra. É decisão de produto,
não de migração de stack, então fica fora da Onda 0.

**Como ligar quando quiser (pós-Onda 0):** rodar no SQL Editor:

```sql
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table clientes;
alter publication supabase_realtime add table projetos;
alter publication supabase_realtime add table pessoas;
alter table tasks replica identity full;
```

O `DataProvider` em `src/lib/supabase/client.ts` + `data-store.tsx`
já assina o canal `kliente360-changes` com auth correto. Habilitar a
publication faz os deltas começarem a aplicar sem mudança de código.

```typescript
// src/lib/supabase/client.ts — singleton do browser client
// DataProvider assina canal kliente360-changes (postgres_changes em
// tasks/clientes/projetos/pessoas). Aplica delta direto em tasks,
// refetch debounced 1200ms em clientes/projetos/pessoas.
```

Não usar Server-Sent Events nem polling — Supabase Realtime já resolve
quando estiver ligado.

---

## Estrutura de arquivos target

```
src/
├── app/
│   ├── (app)/
│   │   ├── backlog/
│   │   │   ├── page.tsx          ← Server Component: só shell + metadata
│   │   │   └── backlog-client.tsx ← 'use client': toda lógica
│   │   ├── kanban/
│   │   │   ├── page.tsx
│   │   │   └── kanban-client.tsx
│   │   ├── cadastros/
│   │   │   └── page.tsx          ← Server Component puro (já feito)
│   │   └── ...
│   └── (auth)/
│       ├── login/page.tsx
│       └── callback/route.ts
├── components/
│   ├── task-modal.tsx             ← 'use client', reutilizado em todas as abas
│   ├── app-nav.tsx               ← já feito
│   └── ...
├── lib/
│   ├── db/                        ← Drizzle (só server-side)
│   ├── supabase/
│   │   ├── client.ts              ← browser client (singleton)
│   │   └── server.ts              ← server client (Server Components/Actions)
│   ├── task-utils.ts              ← helpers portados de lib/helpers.js
│   └── nav.ts                     ← já feito
```

---

## Auth

Usar Supabase Auth — igual ao app atual.

- Login: email + magic link (mesmo fluxo)
- Google OAuth para internos (já existe no app atual)
- `(auth)/login/page.tsx` como Server Component simples
- Middleware Next.js (`middleware.ts`) verifica sessão e redireciona

RLS:
- **Role cliente**: RLS apertada no Postgres (não confiar só no front)
- **Roles admin/interno**: gating no front (igual ao app atual) — Onda 0 não apertará RLS pra internos

---

## Schema Drizzle

O `src/lib/db/schema.ts` atual é um draft. Antes de implementar as telas:

1. Rodar `npm run db:pull` com `DATABASE_URL` real no `.env.local`
2. Isso sobrescreve o schema com a estrutura real do banco
3. Ajustar tipos TypeScript conforme necessário

Tabelas ainda não modeladas (do banco real):
- `task_field_history`
- `task_dependencies`
- `task_attachments`
- `notifications`
- `comments`

---

## O que NÃO fazer nesta onda

- **Não melhorar UX** — idêntico ao atual, validar depois
- **Não adicionar shadcn/ui ainda** — usar CSS puro portado de `lib/styles.css` (já feito)
- **Não instalar Recharts** — os charts do Dashboard são Onda 3
- **Não apertar RLS de admin/interno** — Onda posterior
- **Não implementar features novas** — zero features novas

---

## Ordem de implementação sugerida

### Bloco 1 — Pré-requisitos (fazer antes de qualquer tela)
1. `db:pull` pra alinhar schema com banco real
2. `lib/supabase/client.ts` + `lib/supabase/server.ts`
3. Middleware de auth (`middleware.ts`)
4. Rota de login (`(auth)/login/`)

### Bloco 2 — Telas Onda 1 (Client Components)
5. Backlog (maior + mais complexo — bom pra validar o padrão)
6. Modal de task (reutilizado em todas as abas)
7. Kanban
8. Triagem
9. Meu Foco
10. Calendário

### Bloco 3 — Cadastros completo (Server Component)
11. Modais de criação/edição de cliente, projeto, pessoa

### Bloco 4 — Polimento
12. Command Palette
13. PWA manifest
14. Testes básicos

---

## Estado atual (fim da Onda 0 · pré-cutover)

| Item | Status |
|---|---|
| Design system completo (`globals.css`) | ✅ portado de `lib/styles.css` |
| Fontes IBM Plex Sans + Mono | ✅ |
| Tailwind config com todos os tokens | ✅ |
| `AppNav` idêntica ao app atual | ✅ |
| Cadastros (leitura + arquivar + modais criar/editar) | ✅ |
| Schema Drizzle (draft) | ⚠️ `db:pull` adiado (incompatibilidade drizzle-kit × check constraints); Client Components com Supabase JS não dependem dele |
| `lib/supabase/client.ts` + `server.ts` | ✅ |
| Middleware de auth | ✅ |
| Login (magic link + 2FA) | ✅ |
| Backlog, Kanban, Modal, Triagem, Foco, Calendário | ✅ |
| Notificações (sino + realtime channel) | ✅ realtime dormente — publication Supabase precisa habilitar 4 tabelas |
| Help · Onboarding · Export · Tema · Profile menu | ✅ |
| Command palette · Quick capture · Global shortcuts | ✅ (`⌘K` · `n` · `g+f/b/k/c/d/t/l` · `⌘+Enter` no modal) |
| PWA (manifest + ícones + splash iOS + SW Serwist) | ✅ |
| Vitest (44 testes em helpers puros) | ✅ |
| Playwright (smoke auth-less em 3 cenários) | ✅ |
| GitHub Actions CI (lint + typecheck + vitest + build + e2e) | ✅ `.github/workflows/ci.yml` |
| Briefing · Dashboard · Portal cliente · Adoção | 🅿️ parking (placeholders) |

---

## Roadmap PWA (pós-Onda 0)

A Onda 0 entrega o **mínimo instalável** (manifest + ícones + splash iOS)
+ **service worker básico** (cache de shell + update prompt). Tudo
abaixo fica pra revisitar depois.

### Features postergadas

| Feature | O que faz | Pré-req |
|---|---|---|
| **Push notifications** | Notif assignment/mention chega com app fechado (Android + desktop). iOS suporta a partir do iOS 16.4 (com PWA instalado). | VAPID keys + endpoint server-side pra mandar (Supabase Edge Function ou similar) |
| **Badging API** | Badge com unread count no ícone do app (desktop + Android). | Apenas no client; usar `navigator.setAppBadge(n)` quando notif chega |
| **Web Share Target** | Receber conteúdo via Android Share sheet ("Compartilhar pra tasks 360" → cria task com o texto) | `share_target` no manifest |
| **Web Share API** | Botão "compartilhar task" → share sheet nativa do device | Apenas client (`navigator.share`) |
| **File handlers** | Abrir `.csv` direto no PWA pra importar tasks | `file_handlers` no manifest + handler `launchQueue` |
| **Install prompt custom** | Botão "Instalar app" em vez do banner default do Chrome | `beforeinstallprompt` event |
| **Protocol handler** | `web+tasks360://t/<id>` abre task no app | `protocol_handlers` no manifest |
| **Background sync** | Escritas offline (criar/editar task sem rede) re-sincronizam quando conexão volta | Service worker mais elaborado + IndexedDB |
| **Edge side panel** | Sidebar permanente no Edge | `edge_side_panel` no manifest |
| **Launch handler focus-existing** | Click no atalho foca janela existente em vez de duplicar | `launch_handler.client_mode` no manifest |
| **Cache offline real (read+write)** | App usável 100% offline com fila de sync | SW elaborado + IndexedDB + reconcile UI |

### O que A Onda 0 ENTREGA (bloco 4.I)

- `manifest.webmanifest` completo (name, theme, ícones, shortcuts: Nova task / Meu Foco / Briefing)
- Ícones 32 / 180 / 192 / 512 maskable (reuso dos do Alpine)
- 9 splash screens iOS (apple-touch-startup-image) — geradas via `assets/generate-splash.mjs`
- Meta tags iOS no root layout (apple-mobile-web-app-*, viewport-fit=cover, etc)
- Service Worker básico via `@serwist/next`:
  - Cache-first pros estáticos (HTML, CSS, JS, fontes)
  - Network-first pra API/dados (Supabase)
  - Update prompt quando nova versão do SW estiver pronta
- Lighthouse PWA score ≥ 90 (instalável em ambos os SO)

---

## Fechamento da Onda 0 (mai/2026 · v1.02.161)

Captura final de status. Histórico vivo + roadmap pós-Onda 0 estão em `ROADMAP.md`.

### Blocos · checklist

| Bloco | Entrega | Status |
|---|---|---|
| 1 | Pré-requisitos (Supabase client/server, middleware auth, login page) | ✅ |
| 2 | Telas Onda 1 (Backlog, Kanban, Modal, Triagem, Foco, Calendário) | ✅ |
| 3 | Cadastros completo (CRUD clientes/projetos/pessoas) | ✅ |
| 4.A | Header + ProfileMenu + reordenação de tabs | ✅ |
| 4.B | Polimento mobile (filtros, page-bar, gaps) | ✅ |
| 4.C | Modal de task completo (autosave + comments + anexos + histórico) | ✅ |
| 4.D | Theme toggle (light/dark via `.dark` class + localStorage anti-flash) | ✅ |
| 4.E | Notifications (sino + chips de filtro + realtime channel) | ✅ |
| 4.F | Help · Onboarding · Export (dropdown CSV ativo + PDF parking) | ✅ |
| 4.G | Command palette `⌘K` (tasks/clientes/projetos/pessoas/ações) | ✅ |
| 4.H | Quick capture (`n`) + Global shortcuts (`g+f/b/k/c/d/t/l` · `⌘+Enter` no modal) | ✅ |
| 4.I | PWA (manifest + ícone redondo + splash iOS + service worker Serwist) | ✅ |
| 4.J | Smoke tests (44 vitest + 3 playwright) + CI GitHub Actions + lint zero warnings | ✅ |
| 4.K | Auditoria de paridade Alpine→Next · 5 PRs (A · RLS+segurança · B · Backlog+Modal · C · Cadastros pessoas · D · Mention picker + drafts · E · cleanup) | ✅ |
| 5 | **Cutover Vercel** | ⏸ parqueado · manual quando sinalizado |

### Pendências e parkings declarados

| Item | Status | Onde retomar |
|---|---|---|
| Briefing · Dashboard · Portal cliente · Adoção | ⏸ Placeholders no Next | Roadmap pós-Onda 0 §9.3 do `ROADMAP.md` |
| Realtime publication das 4 tabelas | ⏸ Channel listener pronto; aguarda cutover (não habilitar enquanto Alpine atende prod) | Pós-cutover (ver §9.3.1) |
| Features de `HABILITAR_DEPOIS.md` (Tags, Tipo de trabalho, Dependências) | ❌ Ausentes no código Next | Later (item "Reativar features" de §9.3.3) |
| Schema Drizzle `db:pull` | ⚠️ Adiado (incompat com check constraints) | Atacar quando Dashboard precisar de queries Server tipadas |
| Sentry + PostHog | ❌ Não plugados | Now (item 3 de §9.3.1) |
| JWT exp 1h + refresh | ❌ Default Supabase JWT 2036 | Now (item 4 de §9.3.1) |

### Decisões arquiteturais que sobreviveram à execução

- **Provider stack único** envolvendo o app inteiro: `Theme > Data > Toast > Help > Onboarding > TaskModal > QuickCapture > CommandPalette + GlobalShortcuts + ServiceWorkerRegister`. Modais shareados entre abas via lift-to-provider.
- **Mutadores otimistas** em `DataProvider` (espelho dos 7 helpers de `core-data.js` do Alpine): `patchTask`, `replaceTask`, `upsertTask`, `upsertCliente`, `upsertProjeto`, `upsertPessoa`, `removeTask`. Rollback em erro via `replaceTask(id, prev)`.
- **Event bus minimalista** via `window.dispatchEvent` pra cross-cutting (ex: `CLEAR_FILTERS_EVENT` ouvido em Backlog/Kanban/Triagem/Calendário).
- **Convention "FKs/datas null → `''`"** em `Task` (não nullable strings) — adapter `taskFromDb` normaliza. Tests/code fixtures usam `''` consistente.
- **Checklist item: `body` (não `text`)** — alinhado com DB JSON e Alpine. Bug encontrado em v1.02.161, fix com backfill defensivo no adapter.
- **CSS `!important` Tailwind prefix (`!hidden md:!inline-flex`)** quando regras globais `.btn`/`.tabs-row`/`.page-bar` em `globals.css` (fora de `@layer`) vencem utilities. Documentado nas linhas afetadas.

### Convenções de teste

- **Vitest** (`src/**/*.test.ts`): helpers puros sem DOM/network. `vi.useFakeTimers + setSystemTime` pra testes de aging/prazo. 44 testes em ~400ms.
- **Playwright** (`e2e/*.spec.ts`): smoke auth-less. webServer usa `next dev -p 3100` (evita bug de `next start` com paths que têm espaço).
- **CI** roda lint + typecheck + vitest + build (job `static`) e Playwright (job `e2e`) com env vars Supabase placeholder.

### Cutover (Bloco 5) — checklist

> **Parqueado.** Time validando o app Next em preview antes de fazer o cutover. Será executado manualmente quando o responsável sinalizar — não há prazo definido. Checklist preservado para quando chegar a hora:

1. Confirmar v1.02.NNN bumped em `lib/helpers.js` E `src/components/app-nav.tsx`.
2. Confirmar `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` verdes localmente.
3. Squash-merge `feat/onda-0` em `main` via `mcp__github__merge_pull_request`.
4. No Vercel Dashboard:
   - Apontar domínio principal (custom) pro projeto Next.
   - Apontar Alpine pra subdomínio `alpine.*` como fallback temporário.
5. Avisar time no canal interno: link + "se algo quebrar, voltar pro alpine.* enquanto investigo".
6. Habilitar realtime publication no Supabase Dashboard: `ALTER PUBLICATION supabase_realtime ADD TABLE tasks, clientes, projetos, pessoas;` no SQL Editor.
7. Plugar Sentry: env vars + componente `@sentry/nextjs`.
8. Monitorar 24-48h. Pós-confiança: arquivar `index.html` + `lib/` em `archive/alpine-v1.02.050/`.
