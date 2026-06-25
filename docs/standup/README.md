# Standup diário · operação

Rotina que gera o standup do time todo dia útil às **08:00 BRT** via cloud agent agendado do Claude Code (`/schedule` skill).

## Arquivos

- **`prompt.md`** · instruções que o agent executa a cada run. Editar aqui muda o comportamento da próxima execução automaticamente (re-lido do path absoluto).
- **`README.md`** · este arquivo.

## Backend (já em prod desde v1.03.198)

- Tabela `public.standups` (`data` UNIQUE · UPSERT idempotente)
- Edge functions `post-standup` + `get-standups` (auth via `x-api-key` · `INGEST_API_KEYS`)
- Renderização: `StandupCard` no `/briefing` (desktop) e `/resumo` (mobile)
- MCP tools: `mcp__tasks360__post_standup`, `get_standups`, `get_tasks`, `get_pessoas`, `get_task_comments`

## Rodar manual (smoke test)

Antes de agendar pela primeira vez OU depois de editar o `prompt.md` significativamente:

```bash
claude -p "Execute o standup diário seguindo as instruções em $(pwd)/docs/standup/prompt.md" \
  --allowedTools "mcp__tasks360__get_tasks,mcp__tasks360__get_pessoas,mcp__tasks360__get_task_comments,mcp__tasks360__post_standup"
```

Esperado:
- Stdout com bloco `[standup ok]` + métricas (atrasadas, pedem ajuda, top carga, id)
- Standup novo aparece no `/briefing` (desktop) e `/resumo` (mobile)

## Agendar (uma vez)

Use a skill `/schedule` do Claude Code com:

- **Cron**: `0 11 * * 1-5` (UTC → 08:00 BRT seg-sex)
- **Timezone**: UTC
- **Prompt**: `Execute o standup diário seguindo as instruções em /Users/felipegonzaga/Documents/Code/tasks-360-prod/docs/standup/prompt.md`
- **Allowed tools**:
  - `mcp__tasks360__get_tasks`
  - `mcp__tasks360__get_pessoas`
  - `mcp__tasks360__get_task_comments`
  - `mcp__tasks360__post_standup`

## Gerenciar

- **Listar**: `/schedule list`
- **Pausar/remover**: `/schedule remove <id>` (procurar a routine cujo prompt aponta pra este path)
- **Rodar agora** (one-off, sem mexer na rotina): comando manual da seção acima

## Iterar o prompt

1. Editar `docs/standup/prompt.md`
2. `git commit + git push`
3. Próxima execução pega a versão nova automaticamente (o cloud agent lê o file system na execução)

Sem rebuild, sem redeploy, sem mexer no schedule. É o motivo de manter o prompt como arquivo separado em vez de embutido no schedule.

## Verificar saúde

- Dashboard Supabase → Table editor → `standups` → conferir que o row do dia anterior existe
- Dashboard Supabase → Edge Functions → `post-standup` → logs (200 OK na execução)
- Briefing/Resumo no app → card do dia exibido

## Riscos conhecidos

- **DST no Brasil** (improvável retornar) · revisar cron 1x/ano em out-mar
- **Custo de tokens**: ~$0.70/mês em Sonnet · `/schedule list` mostra consumo se quiser monitorar
- **MCP server offline** → execução falha · fallback do prompt publica standup mínimo
- **Idempotência**: re-execução no mesmo dia substitui (UPSERT por `data`) · seguro
