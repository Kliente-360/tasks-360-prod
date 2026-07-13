# Tasks 360 ← Gemini Notes — Roadmap

Estado atual e próximos passos quando o volume crescer ou aparecerem casos edge.

## Estado atual (v1)

| Componente | Tecnologia | Onde roda |
|---|---|---|
| Trigger | Apps Script time-driven (a cada 10 min) | Google Cloud (sem dependência local) |
| Extração de action items | Regex em JavaScript | Apps Script |
| Match cliente/responsável | Lookups via API + heurísticas | Apps Script |
| Criação de tasks | POST `/ingest-task` (Supabase Edge Function) | API existente |
| MCP server (Cloudflare Worker) | Mantido pra uso interativo no Cowork | Cloudflare |

Custo: zero. Latência: até 10 min após o email chegar.

---

## v2 — Extração via Claude API (quando regex falhar)

**Quando migrar:**
- Aparecerem reuniões cujo formato não bate com o regex (ex: Gemini muda template)
- Action items mais ambíguos (várias frases por bullet, contexto importante pra entender quem é responsável)
- Necessidade de inferir prioridade/prazo/esforço a partir do texto

**O que muda:**
- Apps Script chama `https://api.anthropic.com/v1/messages` com o body do email
- Prompt pede JSON estruturado: `[{titulo, descricao, assignees, prioridade?, prazo?}]`
- Resto do fluxo (cliente match, responsável match, ingest_task) continua igual

**Setup adicional:**
- Conta Anthropic + API key (https://console.anthropic.com)
- Adicionar `ANTHROPIC_API_KEY` em Script Properties
- ~50 linhas de código a mais no `Code.gs`

**Custo:**
- Modelo recomendado: Haiku (mais barato e rápido pra extração)
- ~1k tokens input + 500 output por email = ~US$ 0.001/email (Haiku) ou ~US$ 0.005 (Sonnet)
- Volume estimado: 50 emails/mês → US$ 0.05–0.25/mês

---

## v3 — Real-time via Gmail Push Notifications

**Quando migrar:**
- Latência de 10 min for inaceitável (ex: action items que precisam reagir em minutos)
- Volume aumentar muito (>200 emails/dia, vale a pena evitar polling)

**Arquitetura:**
1. Google Cloud Pub/Sub topic
2. Gmail watch() registra esse topic pra notificar mudanças no inbox
3. Webhook handler (Cloudflare Worker) recebe push, processa email, cria task
4. Worker já existe (`tasks360-mcp`) — adicionar um novo path `/webhook/gmail`

**Setup:**
- Google Cloud project com Pub/Sub habilitado
- IAM: service account com escopo Gmail
- Subscription configurada pra POST no Worker
- Renovação do `watch()` a cada 7 dias (cron no próprio Worker)

**Trabalho estimado:** ~2h. Vale só se latência virar gargalo.

---

## v4 — Outras melhorias possíveis

- ✅ **Marcar emails processados** com label `tasks360/processado` (+ `tasks360/skip` pra reuniões puladas) no Gmail. _(Feito em 2026-05-18 — resolve o caso de task deletada que reaparecia no próximo run; query passou a excluir as duas labels. Skip ajuda a auditar reuniões que o script decidiu não processar.)_
- **Notificação ao Felipe** quando tasks são criadas com `responsavel` vazio (ex: caso Eduardo) — Slack ou email. Hoje fica silencioso.
- **Auto-cadastro de pessoas** quando o script vê um email @kliente360.com novo nas reuniões mas não está em get_pessoas (criar via endpoint adicional `/upsert-pessoa`).
- **Dashboard simples** (página HTML hospedada no Worker) mostrando últimas N runs do Apps Script, taxa de erro, etc.
- **Re-processar histórico**: comando manual pra varrer Gemini emails antigos (ex: últimos 90 dias) — útil ao mudar regras de extração.

---

## Componentes que podem ficar para sempre

- **API Tasks 360 (Supabase Edge Functions):** já é a fonte da verdade.
- **Cloudflare Worker MCP:** uso interativo no Cowork ("Claude, qual cliente tem mais task pendente?"), não pra automação.
- **Apps Script:** funciona enquanto o volume for moderado e o formato Gemini se mantiver estável.

Tudo é trocável de forma incremental — se v2 ou v3 entrarem em ação, o resto continua sem mexer.
