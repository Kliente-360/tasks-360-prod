# CLAUDE.md

Convenções do projeto que valem pra qualquer sessão.

> **Sobre este repo**: `tasks-360-prod` é o repo produtivo do app Next — único ambiente de produção desde jun/2026. Foi separado de `Kliente-360/tasks-360-mvp` (Alpine desativado com o cutover em jun/2026). Trabalho diário acontece aqui.

> **Roadmap vivo**: ler **`STATUS.md`** no início de toda sessão relevante — é a fonte de verdade do estado atual (NOW/NEXT/LATER/done). `ROADMAP.md` é arquivo histórico imutável; não editar para refletir estado corrente.

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
- **Versão atual: `v1.02.231`** (pós-cutover · em produção).
- A versão é declarada em `src/components/app-nav.tsx` (constante `APP_VERSION`).
- Em mudança grande de UX/dados, bumpa MINOR e zera BUILD (decisão manual). Último bump: 01→02 fechando o ciclo de design (PRs #253-#270).
- Após commit em main, arquivos de migration vão pra `supabase/migrations/applied/` (mover manualmente — não tem automação).

## Git workflow

- Branch temporária `feat/*`/`fix/*`/`refactor/*`/`chore/*` → push → PR via `mcp__github__create_pull_request` → squash-merge via `mcp__github__merge_pull_request`. GitHub deleta a head branch automaticamente ("Automatically delete head branches" ativo). Resultado: 1 commit em `main`, zero branches sobreviventes.
- Nada de manter branches paralelas. Cada PR é uma sessão de trabalho fechada.
- Branches `claude/*` criadas pelo harness são ignoradas — não usar, não deletar.
- Antes de commitar: bumpar `APP_VERSION` (ver §Versionamento).
- **Sempre `git pull origin main` antes de criar branch nova**, pra evitar divergência local.

## Onda 0 · migração Alpine → Next (✅ concluída · em produção jun/2026)

Ver **`ONDA0.md`** pro plano completo. **Todos os blocos 1-5 entregues.**

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

Ver **`STATUS.md`** para o estado atual (fonte de verdade).
Ver **`ROADMAP.md` §9.3** para o consolidado histórico Now/Next/Later/Cold.
