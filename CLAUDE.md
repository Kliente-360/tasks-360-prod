# CLAUDE.md

Convenções do projeto que valem pra qualquer sessão.

> **Sobre este repo**: `tasks-360-prod` é o repo produtivo do app Next — único ambiente de produção desde jun/2026. Foi separado de `Kliente-360/tasks-360-mvp` (Alpine desativado com o cutover em jun/2026). Trabalho diário acontece aqui.

> **Roadmap vivo**: ler **`docs/gestao/STATUS.md`** no início de toda sessão relevante — é a fonte de verdade do estado atual (NOW/NEXT/LATER/done). `docs/gestao/ROADMAP.md` é arquivo histórico imutável; não editar para refletir estado corrente.

## CLIs disponíveis (jun/2026)

Felipe instalou e mantém atualizado:
- **Supabase CLI** (`brew install supabase/tap/supabase`) — login uma vez via `supabase login`, projeto linkado em `supabase/.temp/project-ref`
- **Vercel CLI** (`npm i -g vercel`)
- **Netlify CLI** (`brew install netlify-cli`)
- **GitHub CLI** (`gh`)

Pode usar qualquer um sem perguntar — substitui as instruções antigas de "fazer pelo Dashboard" para Supabase.

## Supabase

- **Migrations**: SQL ad-hoc cola no **SQL Editor** do Dashboard (mais ágil pra one-off). Mudanças versionadas usam `supabase db push` com arquivo em `supabase/migrations/`.
- **Edge functions**: deploy via `supabase functions deploy <nome>` (Felipe já login + link feitos).
- **Secrets**: `supabase secrets set KEY=value` ou Dashboard → Edge Functions → Settings → Secrets.
- **Cron**: Dashboard → Database → Extensions (toggle `pg_cron`/`pg_net`) + SQL Editor pra `cron.schedule(...)`.
- **Storage bucket**: SQL ou Storage → New bucket no Dashboard.
- **Testar edge function**: curl com URL `https://<project-ref>.supabase.co/functions/v1/<nome>` + `x-api-key` apropriado, ou `supabase functions invoke <nome>`.

## Versionamento

- `APP_VERSION` segue `v1.<MINOR>.<BUILD>`. **Bumpa BUILD +1 antes de cada commit em main.**
- BUILD é sequencial independente do número do PR no GitHub — os dois divergiram ao longo do trabalho de design e **não tentar realinhar**.
- **Versão atual: `v1.03.001`** (pós-redesign DS · em produção).
- A versão é declarada em `src/components/app-nav.tsx` (constante `APP_VERSION`).
- Em mudança grande de UX/dados, bumpa MINOR e zera BUILD (decisão manual). Últimos bumps:
  - 01→02 fechando o ciclo de design (PRs #253-#270 do repo legado).
  - **02→03** com o redesign DS completo aplicado em todas as telas (PRs #1-#7 no repo prod, jun/2026).
- A `APP_VERSION` é exibida no rodapé do menu do perfil — mantenha visível.
- Após commit em main, arquivos de migration vão pra `supabase/migrations/applied/` (mover manualmente — não tem automação).

## Vercel

- **Só `main` faz deploy.** Previews de branch/PR estão bloqueados pelo `vercel.json` via **`ignoreCommand`** (`exit 1` só se a ref do commit for `main`, senão `exit 0` pula o build). O `git.deploymentEnabled.main: true` sozinho NÃO basta porque branches não listadas default pra enabled no Vercel — daí o ignoreCommand.
- Se precisar testar uma branch antes de mergear: `vercel --prebuilt` local ou trigger manual no dashboard.

## Git workflow

**Trabalho direto em `main`** (decisão jun/2026). Sem PRs intermediários.

- Fluxo padrão: `git pull origin main` → editar → `git add` → bumpar `APP_VERSION` → `git commit` → `git push origin main`. Vercel pega de main e deploya.
- **Não criar branches temporárias** — vai direto pra main. Hoje só Felipe + Claude editam, conflict é improvável, e o overhead de PR-merge não compensa.
- Single exceção: se rolar trabalho experimental que pode quebrar prod (ex: refactor grande, mudança de schema), criar branch local, validar, depois mergear via `git merge --ff-only` em main e push. Sem PR.
- Antes de qualquer commit: bumpar `APP_VERSION` (ver §Versionamento) e rodar `npm run typecheck` + `npm run lint` (build full opcional, só se mudou CSS).
- Branches `claude/*` criadas por harness anterior podem ser deletadas se aparecerem.

## Onda 0 · migração Alpine → Next (✅ concluída · em produção jun/2026)

Plano e blocos da Onda 0 foram entregues integralmente (jun/2026); ver histórico no git ou em `docs/gestao/ROADMAP.md` §"Onda 0 (cutover)".

Arquitetura (na prática, virou **quase 100% Client Components**):
- **Client Components com Supabase JS**: telas interativas (Backlog, Kanban, Modal, Triagem, Foco, Calendário) — boot + estado em memória + realtime channel.
- **Cadastros** também Client Component pelo mesmo `DataProvider` (Server fetch duplicaria dados).
- **Server Components**: só layouts e o login.
- **Não usar Server Actions** em telas com >1 interação/segundo — latência inaceitável.
- Helpers portados pra `src/lib/task-utils.ts` com cobertura de testes (44 unit · 3 e2e).

### Sem ORM

Stack 100% **Next + Supabase JS, sem ORM**. Drizzle foi removido em v1.02.226 — única tela que usava (Cadastros) foi migrada pra Supabase JS direto pelo mesmo motivo das outras (latência inaceitável via Server Action + Edge runtime, ~300-600ms vs ~50-150ms direto).

Se voltar a fazer sentido (ex: agregações pesadas server-side no Dashboard), avaliar Kysely ou voltar Drizzle — mas só com dor concreta justificando, não preventivamente.

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

## Roadmap

Ver **`docs/gestao/STATUS.md`** para o estado atual (fonte de verdade).
Ver **`docs/gestao/ROADMAP.md` §9.3** para o consolidado histórico Now/Next/Later/Cold.
