# CLAUDE.md

Convenções do projeto que valem pra qualquer sessão.

> **Sobre este repo**: `tasks-360-prod` é o repo produtivo do app Next (sprint final). Foi separado de `Kliente-360/tasks-360-mvp` (que ainda hospeda o Alpine em prod no Netlify até o cutover). Trabalho diário acontece aqui.

## Supabase

- **Nunca instruir Supabase CLI.** O usuário não usa CLI — tudo é feito pelo Dashboard (SQL Editor, Edge Functions UI, Database > Extensions, Database > Cron).
- Migrations: cola o SQL no **SQL Editor** e roda.
- Edge functions: cria/edita no **Edge Functions** do dashboard (copy-paste do `supabase/functions/<nome>/index.ts`) e clica em Deploy.
- Secrets (envs de function): **Edge Functions > Settings > Secrets** no dashboard.
- Cron: **Database > Extensions** (habilitar `pg_cron` e `pg_net` pelo toggle) + SQL Editor pra rodar `cron.schedule(...)`.
- Storage bucket: dá pra criar pelo SQL ou pela UI **Storage > New bucket**, ambos servem.
- Testar edge function: curl manual com a URL `https://<project-ref>.supabase.co/functions/v1/<nome>` e `x-api-key` apropriado.

## Versionamento

- `APP_VERSION` segue `v1.<MINOR>.<BUILD>`. **Bumpa BUILD +1 antes de cada commit em main.**
- BUILD é sequencial independente do número do PR no GitHub — os dois divergiram ao longo do trabalho de design e **não tentar realinhar**.
- **Versão atual: `v1.02.214`** (pós-Onda 0 do Next, pré-cutover).
- A versão é declarada em `src/components/app-nav.tsx` (constante `APP_VERSION`).
  - Repo legado `tasks-360-mvp` ainda mantém o Alpine em `lib/helpers.js` enquanto o cutover não acontece — durante a coexistência, bumpar BUILD lá também ao mexer no Alpine.
- Em mudança grande de UX/dados, bumpa MINOR e zera BUILD (decisão manual). Último bump: 01→02 fechando o ciclo de design (PRs #253-#270).
- Após commit em main, arquivos de migration vão pra `supabase/migrations/applied/` (mover manualmente — não tem automação).

## Git workflow

- Branch temporária `feat/*`/`fix/*`/`refactor/*`/`chore/*` → push → PR via `mcp__github__create_pull_request` → squash-merge via `mcp__github__merge_pull_request`. GitHub deleta a head branch automaticamente ("Automatically delete head branches" ativo). Resultado: 1 commit em `main`, zero branches sobreviventes.
- Nada de manter branches paralelas. Cada PR é uma sessão de trabalho fechada.
- Branches `claude/*` criadas pelo harness são ignoradas — não usar, não deletar.
- Antes de commitar: bumpar `APP_VERSION` (ver §Versionamento).
- **Sempre `git pull origin main` antes de criar branch nova**, pra evitar divergência local.
- **Branch ativa hoje**: `feat/onda-0` (todo trabalho de migração de stack vive aqui, ainda não mergeada em `main` porque o Alpine ainda atende prod).

## Onda 0 · migração Alpine → Next (✅ feature-complete, pré-cutover)

Ver **`ONDA0.md`** pro plano completo. **Tudo dos blocos 1-4.J entregue.**

Arquitetura híbrida (na prática, virou **quase 100% Client Components**):
- **Client Components com Supabase JS**: telas interativas (Backlog, Kanban, Modal, Triagem, Foco, Calendário) — mesmo padrão de dados do Alpine (boot + estado em memória + realtime channel).
- **Cadastros** também virou Client Component pelo mesmo `DataProvider` que já tinha tudo em memória (Server fetch duplicaria dados).
- **Server Components**: só layouts e o login.
- **Não usar Server Actions** em telas com >1 interação/segundo — latência inaceitável.
- Helpers do Alpine legado portados pra `src/lib/task-utils.ts` com cobertura de testes (44 unit · 3 e2e).

### Drizzle ORM — dormente

Instalado mas **não usado em runtime**. Schema draft em `src/lib/db/schema.ts` documenta o shape do DB; `db:pull` continua quebrado por incompat com check constraints. Decisão consciente: o boot único do `DataProvider` cobre tudo, então a ORM não foi necessária. **Volta a entrar em ação quando atacar Dashboard** (agregações pesadas client-side ficam caras — server-side com Drizzle + materialized views resolve, ou troca por Kysely se Drizzle continuar travado). Até lá, fica como peso morto trivial.

**Stack efetiva em runtime: Next + Supabase JS, sem ORM.**

Próximo passo: **Bloco 5 · Cutover Vercel** (domínio principal pro projeto Next).

## CI · GitHub Actions

`.github/workflows/ci.yml` roda em todo PR contra `main` + pushes em `main`:
- **Job `static`**: lint + typecheck + vitest + next build (env Supabase com placeholders).
- **Job `e2e`**: Playwright smoke (auth-less) após o static passar.
- Concurrency cancela runs antigos quando PR recebe push novo.

Em CI as env vars de Supabase usam placeholders (`https://placeholder.supabase.co`) — basta o cliente Supabase JS bootar sem fazer request real.

## Testes locais

No projeto:
- `npm test` — Vitest run (helpers puros, ~400ms).
- `npm run test:watch` — Vitest interativo.
- `npm run test:e2e` — Playwright (sobe `next dev -p 3100`, roda smoke).
- `npm run lint`, `npm run typecheck`, `npm run build`.

## Roadmap pós-Onda 0

Ver **`ROADMAP.md` §9.3 · Roadmap pós-Onda 0 (Next migration completa)** pro consolidado Now/Next/Later com tudo inventariado (IA, time tracking, push, Portal, etc.).
