# Standup diário · operação

Rotina **cloud-hosted** que gera o standup do time todo dia útil às **08:00 BRT** via trigger do claude.ai/code (não precisa do app aberto).

## Arquivos

- **`prompt.md`** · instruções que o agent executa em cada run. Editar aqui muda o comportamento da próxima execução.
- **`README.md`** · este arquivo.

## Como funciona

1. Trigger remoto registrado via API `https://api.claude.ai/v1/code/triggers` (cron `0 11 * * 1-5` UTC = 08:00 BRT seg-sex).
2. Cada fire: claude.ai sobe um agent na cloud, clona o repo `Kliente-360/tasks-360-prod`, lê `docs/standup/prompt.md` e executa.
3. Agent chama 4 edge functions via curl (auth `x-api-key`):
   - `get-tasks` (atrasadas + curto prazo)
   - `get-pessoas` (carga)
   - `get-task-comments` (críticas)
   - `post-standup` (UPSERT idempotente)
4. Renderização: `StandupCard` no `/briefing` (desktop) e `/resumo` (mobile) — auto-refresh ao reabrir.

## Smoke manual

Pra testar o prompt sem agendar (ou após editar):

```bash
# Defina a key uma vez na sessão
export TASKS360_API_KEY="<sua key INGEST_API_KEYS>"

# Rode o que o agent rodaria
claude -p "Execute o standup diário seguindo as instruções em $(pwd)/docs/standup/prompt.md"
```

Esperado: bloco `[standup ok]` no stdout + card novo no `/briefing`.

## Gerenciar o trigger remoto

Via Claude Code (esta sessão), usando o tool `RemoteTrigger`:
- **Listar**: `RemoteTrigger(action: "list")`
- **Pausar/editar**: `RemoteTrigger(action: "update", trigger_id: "trig_...", body: { enabled: false })`
- **Rodar agora**: `RemoteTrigger(action: "run", trigger_id: "trig_...")`

Via web: dashboard do claude.ai/code mostra as routines com last_fire + next_fire + logs.

## Iterar o prompt

1. Edita `docs/standup/prompt.md`
2. `git commit + git push`
3. Próxima execução pega a versão nova (o agent clona main a cada run)

Sem rebuild, sem re-criar trigger. Versionamento via git.

## Verificar saúde

- `RemoteTrigger(action: "get", trigger_id: "trig_...")` → mostra last_fired_at + next_run_at
- Supabase Dashboard → Table editor → `standups` → conferir row do dia anterior
- Supabase Dashboard → Edge Functions → logs (200 OK em cada execução)
- Briefing/Resumo no app → card do dia exibido

## Auth & secrets

- `TASKS360_API_KEY` (valor do `INGEST_API_KEYS` no Supabase) embutida no prompt do trigger
- Pra rotacionar: atualizar `INGEST_API_KEYS` no Supabase + `RemoteTrigger(action: "update", body: { ... prompt com nova key ... })`

## Riscos conhecidos

- **DST no Brasil** (improvável retornar) · revisar cron 1x/ano em out-mar
- **Custo**: rodando no plano claude.ai do Felipe · usa tokens dele a cada run
- **Idempotência**: re-execução no mesmo dia substitui (UPSERT por `data`) · seguro
- **Visibilidade**: trigger usa Bash + WebFetch · zero MCP (mais fácil de debugar)
