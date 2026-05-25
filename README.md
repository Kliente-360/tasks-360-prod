# tasks 360 — Next.js (Onda 0 ✅ feature-complete · pré-cutover)

App em **`feat/onda-0`** com paridade UX 100% vs Alpine, em preview Vercel. Subindo pra prod no Bloco 5 (cutover de domínio).

App Alpine em prod até cutover: raiz do repo (`../index.html` + `../lib/`), Netlify auto-deploy de `main`.

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
cd web
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
│   │   │   ├── briefing/          # placeholder · parking
│   │   │   ├── dashboard/         # placeholder · parking
│   │   │   ├── portal/            # placeholder · parking
│   │   │   ├── adocao/            # placeholder · parking
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
│   │   ├── help-modal.tsx         # HelpProvider (lê docs/HOWTO.md ou HOWTO_CLIENTE.md)
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
├── ONDA0.md                       # Plano + fechamento da Onda 0
└── README.md                      # (este arquivo)
```

## Testes

- **Vitest** (`src/**/*.test.ts`): helpers puros sem DOM/network. `vi.useFakeTimers + setSystemTime` pra testes de aging/prazo determinísticos.
- **Playwright** (`e2e/*.spec.ts`): smoke auth-less. webServer usa `next dev -p 3100` (evita bug do `next start` com paths que têm espaço — iCloud Drive local).

## CI

`.github/workflows/ci.yml` na raiz do repo:
- **Job `static`**: lint + typecheck + vitest + build (env Supabase com placeholders).
- **Job `e2e`**: Playwright após static passar; upload de `playwright-report` como artifact em failure.

## Status da Onda 0

Tudo dos blocos 1-4.J entregue. Status table completa em **`ONDA0.md`** (final do arquivo).

**Próximo**: Bloco 5 · Cutover Vercel. Checklist em `ONDA0.md`.

## Roadmap pós-cutover

Consolidado completo (Now / Next / Later / Cold) em **`../ROADMAP.md` §9.3 · Roadmap pós-Onda 0**.

Highlights:
- **Now** (~8h): cutover + realtime publication + Sentry + JWT exp 1h.
- **Next** (1-2 meses): Dashboard + Briefing + `ai-suggest` (1ª IA) + Push notifications.
- **Later** (3-6 meses): Portal cliente + cronômetro start/stop + `ai-chat` + Templates de projeto.
