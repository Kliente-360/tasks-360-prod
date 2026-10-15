# Caixas de IA do portal · operação

Duas rotinas **cloud-hosted** (triggers do claude.ai/code) escrevem os textos das caixas no fim do Portal do cliente. O texto é publicado direto, sem revisão.

| Caixa | Modo | Quando | Período gravado |
|---|---|---|---|
| Entregas de valor no mês anterior | `MODO=entregas` | dia 1, 08:00 BRT (`0 11 1 * *` UTC) | `YYYY-MM` do mês anterior |
| Riscos no backlog atual | `MODO=riscos` | todos os dias, 08:00 BRT (`0 11 * * *` UTC) | `YYYY-MM-DD` do dia |

## Arquivos

- `prompt.md` · instruções que o agent executa (os dois modos). Editar + push muda a próxima execução.
- `README.md` · este arquivo.

## Como funciona

1. O trigger clona `Kliente-360/tasks-360-prod`, lê `docs/portal-insights/prompt.md` e executa no modo da mensagem.
2. Para cada cliente externo com tasks no portal: lê tasks (`get-tasks?portal=true`) e comentários visíveis (`get-task-comments?portal=true`), escreve o texto e publica em `post-portal-insight`.
3. Tabela `portal_insights` (upsert por cliente + tipo + período). O portal mostra o mais recente de cada tipo; cliente só lê os próprios (RLS).

## Smoke manual

```bash
export TASKS360_API_KEY="<valor de INGEST_API_KEYS>"
claude -p "MODO=riscos. Execute as instruções em $(pwd)/docs/portal-insights/prompt.md"
```

Esperado: bloco `[portal-insights MODO=riscos ok]` no stdout e o texto na caixa do portal.

## Gerenciar

Mesmo esquema do standup (`docs/standup/README.md`): `RemoteTrigger` list/get/update/run, ou o painel de routines do claude.ai/code.

## Cuidados

- `portal=true` nos dois GETs é o que impede tarefa privada e anotação interna de aparecer no texto. Não remover.
- Re-executar no mesmo período substitui o texto (seguro).
- Custo: roda no plano claude.ai do Felipe, um texto por cliente por execução.
