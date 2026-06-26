# Prompt do standup diário — Tasks 360

Este arquivo é o "programa" da rotina agendada (cloud trigger no claude.ai) que gera o standup todo dia útil às 08:00 BRT. Editar este arquivo + commit é tudo o que precisa pra mudar o comportamento da próxima execução.

A rotina chama as edge functions HTTP diretamente (não usa MCP). Auth via header `x-api-key` (`INGEST_API_KEYS`).

---

## Endpoints

Base URL: `https://nxtlipldmsopscpshrfd.supabase.co/functions/v1`

| Endpoint | Método | Uso |
|---|---|---|
| `/get-tasks?…` | GET | Tasks ativas (sempre com `exclude_privadas=true&exclude_internos=true`) |
| `/get-pessoas?…` | GET | Pessoas + carga (sempre com `exclude_privadas=true&exclude_internos=true`) |
| `/get-task-comments?task_id=…` | GET | Comments de uma task |
| `/post-standup` | POST | UPSERT idempotente por data |

**Filtros obrigatórios em get-tasks e get-pessoas:**
- `exclude_privadas=true` — esconde tasks privadas (do CEO etc · não vão pro standup do time)
- `exclude_internos=true` — esconde tasks de clientes internos (Kliente 360 etc · ruído operacional)

Header obrigatório em todos: `x-api-key: $TASKS360_API_KEY`.

---

## Instruções pro agent

Monte o standup diário do time da Kliente 360 e publique no app. Siga **exatamente** o passo a passo abaixo.

### 1. Datas (BRT · UTC-3 fixo)

- `HOJE` = data atual em BRT (`YYYY-MM-DD`)
- `ONTEM` = `HOJE - 1` dia
- `FIM` = `HOJE + 4` dias

```bash
export TZ="America/Sao_Paulo"
HOJE=$(date +%Y-%m-%d)
ONTEM=$(date -d 'yesterday' +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)
FIM=$(date -d '+4 days' +%Y-%m-%d 2>/dev/null || date -v+4d +%Y-%m-%d)
```

### 2. Fetch dos dados base

Em paralelo:

```bash
BASE="https://nxtlipldmsopscpshrfd.supabase.co/functions/v1"
H="x-api-key: $TASKS360_API_KEY"
F="exclude_privadas=true&exclude_internos=true"

curl -s -H "$H" "$BASE/get-tasks?prazo_ate=$ONTEM&limit=200&$F"               > /tmp/atrasadas.json
curl -s -H "$H" "$BASE/get-tasks?prazo_de=$HOJE&prazo_ate=$FIM&limit=200&$F"  > /tmp/curto.json
curl -s -H "$H" "$BASE/get-pessoas?with_load=true&$F"                          > /tmp/pessoas.json
```

Schemas:
- `get-tasks` retorna `{ tasks: [{id, titulo, status, subetapa, prazo, esforco, prioridade, tipo_trabalho, privada, atrasada, criado_por_ia, criado_em, cliente, cliente_id, projeto, projeto_id, responsavel, pessoa_id}], total }`
- `get-pessoas` retorna `{ pessoas: [{id, nome, ..., tasks_ativas, horas_pendentes}] }` — `horas_pendentes` já vem filtrada (sem KL360 e sem privadas)

### 3. Identificar críticas + buscar comments

**Crítica** = `prioridade ∈ {P0, P1}` OU `subetapa = "bloqueado"`.

Pra cada crítica (cap **30** · lotes de **5 paralelos**):

```bash
curl -s -H "$H" "$BASE/get-task-comments?task_id=<TASK_ID>&limit=3"
```

Marca **"pede ajuda"** se algum dos 3 comments casar (case-insensitive):

```
/ajud|apoio|preciso|precisamos|depende|aguardando|pendente|@\w+/
```

Resume o **status atual** da task em 1 frase, baseado no comment mais recente.

### 4. Identificar pendências cruzadas

A partir dos comments das críticas, identifica menções a pessoas/clientes/sistemas que estão bloqueando algo. Agrupa em duas categorias:

- **Aguardando cliente / externo**: cliente nominal (Anderson, Isa, André…), time externo (TI Indigo, Tokenlab, Zenit), cliente como entidade (Cliente TotalPass).
- **Aguardando interno**: pessoa do time (Jessica, Felipe, Henrique…). Quando o comment tem `@Nome` ou frase tipo "precisa apoio de X" / "depende de X".

Essa seção fica no topo do standup, logo após o bloco de Atenção. Ajuda a ver "quem está bloqueado em quem" sem precisar abrir task por task.

### 5. Compor `conteudo_md`

Markdown **sem emoji** (vai pro app · superfície de marca). Tom direto, português.

```markdown
# Standup — <dia da semana>, <DD/MM/AAAA>

**Atenção:** <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo_ate_fim> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda.
Maior carga pendente: <Nome1> (<h1>h) · <Nome2> (<h2>h) · <Nome3> (<h3>h).

## Pendências cruzadas (aguardando resposta)

**Aguardando cliente / externo:**
- **<Nome cliente / externo>** (<contexto>) — <resumo do que bloqueia> (<responsável da task>, <dias>d)
- ...

**Aguardando interno:**
- **<Nome interno>** — <task / contexto> (<responsável>, P?)
- ...

## <Nome> — <N> atrasadas

**Atrasadas:**
- P? · <Título> (<Cliente>) — atrasada Nd. <Status em 1 frase>. *(pede ajuda)* se aplicável.
- ... (todas as P0/P1 atrasadas detalhadas)
- +N P2/P3 atrasadas (<3 títulos curtos>).

**Bloqueadas (N):**
- <Resumo agregado das bloqueadas dessa pessoa>. *(pede ajuda)* se aplicável.

**Pra hoje:**
- P? · <Título> (<Cliente> · <subetapa>).

**Próximos dias:**
- P? · <Título> (<Cliente> · DD/MM · <subetapa>).

→ <Nome>, <pergunta dirigida>?

## <Próxima pessoa> — ...

(repete por responsável, ordenado por nº de atrasadas DESC)

---

*Respondam aqui ou no grupo com status atual e onde precisam de apoio.*
```

**Regras de bucketing por pessoa**:
- **Atrasadas** = `prazo < HOJE` AND `subetapa ≠ bloqueado` AND `status ≠ concluido`
- **Bloqueadas** = `subetapa = bloqueado` (independente de prazo)
- **Pra hoje** = `prazo = HOJE` AND `subetapa ≠ bloqueado` AND `status ≠ concluido`
- **Próximos dias** = `HOJE < prazo ≤ FIM` AND `subetapa ≠ bloqueado` AND `status ≠ concluido`

Cada sub-bucket só renderiza se tiver ≥1 item. Sem item → não aparece a sub-seção.

**Detalhar P0/P1** em todos os buckets. **P2/P3 atrasadas** → agrega como `+N P2/P3 atrasadas (<3 títulos curtos em parênteses>)`. **P2/P3 em curto prazo / pra hoje** → lista cada uma (volume menor, vale ver).

Encerrar bloco de cada pessoa com **pergunta dirigida** invocando o nome.

### 6. Compor `texto_whatsapp`

Versão enxuta. Pode usar **negrito** (`*texto*`), bullets `•`, setas `→`, **máximo 2-3 emojis funcionais** (📌, 🚨, 🙏).

```
*Standup Tasks 360 — <dia>, <DD/MM>*

📌 <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda
Maior carga: <Nome1> (<h>h) · <Nome2> (<h>h) · <Nome3> (<h>h)

*Pendências cruzadas*
• <Externo>: <task / contexto>
• <Interno>: <task / contexto>

*<Nome>* — <N> atrasadas
• P? <Título curto> (<Cliente>) — <status curto>
→ <Nome>, <pergunta>?

(repete por responsável · só destaques P0/P1 + bloqueadas críticas)

Respondam com status e onde precisam de ajuda. Valeu! 🙏
```

### 7. Compor `resumo`

TL;DR de **1-2 frases**: nº atrasadas/bloqueadas, top de carga, quantas pedem ajuda. Citar 1-2 nomes externos chave que estão bloqueando se houver.

### 8. Publicar

```bash
curl -s -X POST -H "$H" -H "Content-Type: application/json" "$BASE/post-standup" \
  -d @- <<JSON
{
  "data": "$HOJE",
  "conteudo_md": $(jq -Rs . <<<"$CONTEUDO_MD"),
  "texto_whatsapp": $(jq -Rs . <<<"$TEXTO_WHATSAPP"),
  "resumo": $(jq -Rs . <<<"$RESUMO")
}
JSON
```

UPSERT por `data`. Resposta: `{ id, data, atualizado_em, action: "created"|"updated" }`.

### 9. Fallback em erro

Se `get-tasks` falhar 2x consecutivas (HTTP ≠ 2xx):

1. Publica conteudo_md mínimo: `# Standup — <DD/MM/AAAA>\nStandup não pôde ser gerado automaticamente. Equipe, favor consultar o Briefing direto no app.`
2. `resumo`: `"Erro automatizado — consultar Briefing."`
3. `texto_whatsapp`: `null`
4. Sai com exit code 1.

### 10. Output stdout final

```
[standup ok|fallback]
data:           <YYYY-MM-DD>
atrasadas:      <N>
bloqueadas:     <N>
pedem_ajuda:    <N>
top_carga:      <Nome1> (<h>h) · <Nome2> (<h>h) · <Nome3> (<h>h)
standup_id:     <uuid>
action:         <"created" | "updated">
```

---

## Tom e marca

- **App/markdown**: zero emoji · português direto · sem clichês corporativos
- **WhatsApp**: máximo 2-3 emojis funcionais · negrito + bullets pra escanear rápido
- **Sempre** terminar bloco da pessoa com pergunta dirigida pelo nome
- **Nunca** opinar sobre desempenho · só descrever fatos (atrasada N dias, último comment diz X)
- **Bloqueadas P2/P3** podem ser agregadas em 1 bullet só quando muitas; **bloqueadas P0/P1** sempre detalham individualmente
