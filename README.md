# tasks 360 — Next.js (✅ em produção · jun/2026)

App em produção no Vercel desde jun/2026. Alpine (`Kliente-360/tasks-360-mvp`) desativado.

## Stack

- **Next.js 15** (App Router, React 19) + **TypeScript** strict
- **Tailwind CSS** v3 — tokens da marca Kliente 360 em `src/app/globals.css`
- **Drizzle ORM** — **instalado mas dormente em runtime**. Schema draft em `src/lib/db/schema.ts` serve como documentação do shape do DB; nenhuma linha de runtime importa. `db:pull` continua quebrado (incompat com check constraints). Volta a entrar em ação quando atacar Dashboard (agregações server-side). Detalhes em `CLAUDE.md` § "Drizzle ORM — dormente".
- **Supabase** — mesmo projeto do Alpine (Auth, Realtime, Postgres). Client em `src/lib/supabase/{client,server}.ts`. **Stack efetiva em runtime hoje: Next + Supabase JS, sem ORM.**
- **@serwist/next** — service worker PWA (precache + runtime cache)
- **marked** — Markdown (Help, Onboarding)
- **@resvg/resvg-js** — gera splash screens iOS no build-time (`scripts/generate-splash.mjs`)
- **Vitest** + **Playwright** — testes (ver §Testes)

> Componentes UI: **não usamos shadcn/ui**. Os primitivos (`.btn`, `.card`, `.inp`, `.chip`) vieram portados de `lib/styles.css` do Alpine. Recharts **descartado** — gráficos quando vierem usam Chart.js ou SVG nativo.

## Rodar local

```bash
cp .env.example .env.local   # preencher as 3 chaves
npm install
npm run dev                  # http://localhost:3000
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | Build de produção |
| `npm run start` | Serve build de produção |
| `npm run lint` | ESLint (deve ser 0 warnings) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest run (44 unit tests em ~400ms) |
| `npm run test:watch` | Vitest interativo |
| `npm run test:e2e` | Playwright smoke (`next dev` + 3 auth-less tests) |
| `npm run db:pull` | Drizzle pull do schema real (atualmente quebrado por check constraints — não rodar) |

## Env vars

| Var | O quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (mesmo do app atual) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (RLS protege) |
| `DATABASE_URL` | Connection string do Postgres pro Drizzle (server-only, atualmente não usado em runtime) |

Em CI (GitHub Actions) e em smoke local podem ser **placeholders** (`https://placeholder.supabase.co` + qualquer string) — o Supabase JS boota sem fazer request real, e os tests auth-less não tocam o backend.

## Estrutura

```
.
├── src/
│   ├── app/                       # App Router
│   │   ├── (app)/                 # Rotas autenticadas (layout próprio + provider stack)
│   │   │   ├── backlog/
│   │   │   ├── kanban/
│   │   │   ├── triagem/
│   │   │   ├── foco/
│   │   │   ├── calendario/
│   │   │   ├── cadastros/
│   │   │   ├── briefing/
│   │   │   ├── dashboard/
│   │   │   ├── portal/
│   │   │   └── layout.tsx         # Provider stack
│   │   ├── (auth)/login/          # Magic link + 2FA
│   │   ├── auth/callback/         # OAuth callback
│   │   ├── icon.svg               # File-based favicon (Next 15 convention)
│   │   ├── layout.tsx             # Root layout (metadata + iOS splash links + theme anti-flash)
│   │   ├── globals.css            # Design system tokens + utilities
│   │   └── sw.ts                  # Service worker (Serwist)
│   ├── components/
│   │   ├── app-nav.tsx            # Header com APP_VERSION constante
│   │   ├── app-splash.tsx         # Loading overlay (copy do Alpine)
│   │   ├── task-modal.tsx         # ~2000 linhas · modal de task completo
│   │   ├── data-store.tsx         # DataProvider + useData()
│   │   ├── toast.tsx              # ToastProvider + useToast / useToastSafe
│   │   ├── theme-toggle.tsx       # ThemeProvider (light/dark via .dark class)
│   │   ├── help-modal.tsx         # HelpProvider (fetch /docs/HOWTO.md ou HOWTO_CLIENTE.md de public/docs/)
│   │   ├── onboarding-modal.tsx   # OnboardingProvider (3 personas)
│   │   ├── notif-bell.tsx         # Sino + realtime channel
│   │   ├── command-palette.tsx    # ⌘K
│   │   ├── quick-capture.tsx      # n
│   │   ├── global-shortcuts.tsx   # g+f/b/k/c/d/t/l · ⌘+Enter no modal
│   │   ├── profile-menu.tsx       # Avatar dropdown
│   │   ├── export.tsx             # CSV ativo · PDF parking
│   │   └── sw-register.tsx        # Service worker register + update prompt
│   ├── lib/
│   │   ├── task-utils.ts          # Helpers puros (portados de lib/helpers.js)
│   │   ├── task-utils.test.ts     # 44 unit tests Vitest
│   │   ├── task-constants.ts      # STATUS, ROLE, STAGE_RANK, SUB_TO_MACRO
│   │   ├── types.ts               # Task, Cliente, Projeto, Pessoa, ChecklistItem
│   │   ├── adapters.ts            # taskFromDb / clienteFromDb / etc + TASK_LIGHT_COLS
│   │   ├── data-store.tsx         # (já listado)
│   │   ├── events.ts              # CLEAR_FILTERS_EVENT bus
│   │   ├── format.ts              # fmtBytes / fmtPostedEm / escapeHtml / renderCommentBody
│   │   ├── nav.ts                 # NAV array (tabs)
│   │   ├── utils.ts               # cn() de Tailwind
│   │   ├── db/schema.ts           # Drizzle (draft · não usado em runtime ainda)
│   │   └── supabase/{client,server}.ts
│   └── middleware.ts              # Gating de rotas
├── e2e/login.spec.ts              # Playwright smoke
├── public/
│   ├── manifest.webmanifest
│   ├── docs/{HOWTO,HOWTO_CLIENTE,ONBOARDING}.md
│   └── assets/{favicon-32,icon-180,icon-192,icon-512,icon,splash/*}.{png,svg}
├── scripts/generate-splash.mjs    # Gera 18 splash PNGs (9 devices × light/dark)
├── playwright.config.ts
├── vitest.config.ts
├── next.config.mjs                # Serwist plugin
└── README.md                      # (este arquivo)
```

> **Docs do projeto**: HOWTO, HOWTO_CLIENTE e ONBOARDING moram em `public/docs/` (servidos em runtime pelos modais Help/Onboarding). Gestão (estado, KPIs, roadmap histórico) em `docs/gestao/` — `STATUS.md` (estado vivo), `KPIS.md` (definições), `ROADMAP.md` (histórico imutável). `CLAUDE.md` (convenções pro agente) fica na raiz por convenção do Claude Code.

## Testes

- **Vitest** (`src/**/*.test.ts`): helpers puros sem DOM/network. `vi.useFakeTimers + setSystemTime` pra testes de aging/prazo determinísticos.
- **Playwright** (`e2e/*.spec.ts`): smoke auth-less. webServer usa `next dev -p 3100` (evita bug do `next start` com paths que têm espaço — iCloud Drive local).

## CI

`.github/workflows/ci.yml` na raiz do repo:
- **Job `static`**: lint + typecheck + vitest + build (env Supabase com placeholders).
- **Job `e2e`**: Playwright após static passar; upload de `playwright-report` como artifact em failure.

## Status

Onda 0 completa · cutover executado · Alpine desativado (jun/2026).

Estado atual e backlog em **`docs/gestao/STATUS.md`**. Histórico completo em **`docs/gestao/ROADMAP.md` §9.3**.
