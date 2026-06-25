# Prompt do standup diário — Tasks 360

Este arquivo é o "programa" da rotina agendada (cloud trigger no claude.ai) que gera o standup todo dia útil às 08:00 BRT. Editar este arquivo + commit é tudo o que precisa pra mudar o comportamento da próxima execução.

A rotina chama as edge functions HTTP diretamente (não usa MCP). Auth via header `x-api-key` (mesmo `INGEST_API_KEYS` que outras integrações usam).

---

## Endpoints

Base URL: `https://nxtlipldmsopscpshrfd.supabase.co/functions/v1`

| Endpoint | Método | Uso |
|---|---|---|
| `/get-tasks?prazo_de=…&prazo_ate=…&limit=200` | GET | Tasks ativas (filtra por janela de prazo) |
| `/get-pessoas?with_load=true` | GET | Pessoas + tasks_ativas + horas_pendentes |
| `/get-task-comments?task_id=…&limit=3` | GET | Comments de uma task |
| `/post-standup` | POST | UPSERT do standup (idempotente por data) |

Header obrigatório em todos: `x-api-key: $TASKS360_API_KEY` (injetado no env do trigger).

---

## Instruções pro agent

Monte o standup diário do time da Kliente 360 e publique no app. Siga exatamente o passo a passo abaixo, sem improviso.

### 1. Datas (BRT · UTC-3 fixo)

- `HOJE` = data atual em BRT (`YYYY-MM-DD`)
- `ONTEM` = `HOJE - 1` dia
- `FIM` = `HOJE + 4` dias

Use `date` no Bash com timezone `America/Sao_Paulo`:

```bash
export TZ="America/Sao_Paulo"
HOJE=$(date +%Y-%m-%d)
ONTEM=$(date -v-1d +%Y-%m-%d)   # macOS · em Linux: $(date -d 'yesterday' +%Y-%m-%d)
FIM=$(date -v+4d +%Y-%m-%d)     # macOS · em Linux: $(date -d '+4 days' +%Y-%m-%d)
```

### 2. Fetch dos dados base

Em paralelo (3 curls):

```bash
BASE="https://nxtlipldmsopscpshrfd.supabase.co/functions/v1"
H="x-api-key: $TASKS360_API_KEY"

curl -s -H "$H" "$BASE/get-tasks?prazo_ate=$ONTEM&limit=200"               > /tmp/atrasadas.json
curl -s -H "$H" "$BASE/get-tasks?prazo_de=$HOJE&prazo_ate=$FIM&limit=200"  > /tmp/curto.json
curl -s -H "$H" "$BASE/get-pessoas?with_load=true"                          > /tmp/pessoas.json
```

Schema de resposta:
- `get-tasks` retorna `{ tasks: [{id, titulo, status, subetapa, prazo, esforco, prioridade, tipo_trabalho, atrasada, criado_por_ia, criado_em, cliente, cliente_id, projeto, projeto_id, responsavel, pessoa_id}], total }`
- `get-pessoas` retorna `{ pessoas: [{id, nome, email, role, senioridade, capacidade_horas_semana, skills, cliente_principal_id, cliente_secundario_id, tasks_ativas, horas_pendentes}] }`

### 3. Identificar críticas + buscar comments

**Crítica** = `prioridade ∈ {P0, P1}` OU `status = "bloqueado"`.

Pra cada crítica (cap **30** · em lotes de **5 paralelos**), busca comments:

```bash
curl -s -H "$H" "$BASE/get-task-comments?task_id=<TASK_ID>&limit=3"
```

Schema: `{ comentarios: [{id, autor, data, texto}], total }`

Marca a task como **"pede ajuda"** se algum dos 3 comments casar (case-insensitive) com:

```
/ajud|apoio|preciso|precisamos|depende|aguardando|pendente|@\w+/
```

Resume **status atual** da task em 1 frase, baseado no comment mais recente.

### 4. Compor `conteudo_md`

Markdown **sem emoji** (vai pro app · superfície de marca). Tom direto, português.

Estrutura:

```markdown
# Standup — <dia da semana>, <DD/MM/AAAA>

**Atenção:** <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo_ate_fim> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda.
Maior carga pendente: <Nome1> (<h1>h) · <Nome2> (<h2>h) · <Nome3> (<h3>h).

## <Nome> — <N> atrasadas

- **<P0|P1> · <Título>** (<Cliente>) — atrasada <N>d / vence <DD/MM>. <Status pelo último comment.> [(pede ajuda)] [(bloqueada)]
- ... (todas as P0/P1 atrasadas + curto prazo dessa pessoa)
- Bloqueadas (N): <resumo das bloqueadas de menor prioridade em 1 linha>
- +N P2/P3 atrasadas (<3 títulos curtos em parênteses>)

→ <Nome>, status e onde precisa de apoio?

## <Próxima pessoa> — ...

---

*Respondam aqui ou no grupo com status atual e onde precisam de apoio.*
```

Regras:
- Ordenar pessoas por nº de atrasadas (desc)
- Detalhar P0/P1 da pessoa (atrasadas + curto prazo)
- Bloqueadas de menor prioridade: 1 bullet agregado
- P2/P3 atrasadas: só contagem
- Pergunta dirigida no fim de cada bloco

### 5. Compor `texto_whatsapp`

Versão pra colar no grupo do WhatsApp. Pode usar **negrito** (`*texto*`), bullets `•`, setas `→`, **máximo 2-3 emojis funcionais** (📌, 🚨, 🙏).

Estrutura:

```
*Standup Tasks 360 — <dia>, <DD/MM>*

📌 <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda
Maior carga: <Nome1> (<h>h) · <Nome2> (<h>h) · <Nome3> (<h>h)

*<Nome>* — <N> atrasadas
• <P0|P1> <Título curto> (<Cliente>) — <prazo em palavra>
→ <Nome>, status e onde precisa de apoio?

(repete por responsável · só destaques P0/P1)

Respondam com status e onde precisam de ajuda. Valeu! 🙏
```

### 6. Compor `resumo`

TL;DR de **1-2 frases**: nº atrasadas/bloqueadas, top de carga, quantas pedem ajuda.

### 7. Publicar

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

UPSERT por `data` — se já existir standup pra hoje, substitui (`action: "updated"`).

Resposta: `{ id, data, atualizado_em, action: "created"|"updated" }`

### 8. Fallback em erro

Se `get-tasks` falhar 2x consecutivas (HTTP ≠ 2xx):

1. Publica conteudo_md mínimo:
   ```
   # Standup — <DD/MM/AAAA>
   Standup não pôde ser gerado automaticamente. Equipe, favor consultar o Briefing direto no app.
   ```
2. `resumo`: `"Erro automatizado — consultar Briefing."`
3. `texto_whatsapp`: `null`
4. Sai com exit code 1.

### 9. Output stdout final

Sempre printa um resumo enxuto:

```
[standup ok|fallback]
data:           <YYYY-MM-DD>
atrasadas:      <N>
bloqueadas:     <N>
pedem_ajuda:    <N>
top_carga:      <Nome1> (<h>h) · <Nome2> (<h>h) · <Nome3> (<h>h)
standup_id:     <uuid retornado pelo post_standup>
action:         <"created" | "updated">
```

---

## Tom e marca

- **App/markdown**: zero emoji · português direto · sem clichês corporativos
- **WhatsApp**: máximo 2-3 emojis funcionais · negrito + bullets pra escanear rápido
- **Sempre** terminar bloco da pessoa com pergunta dirigida pelo nome
- **Nunca** opinar sobre desempenho · só descrever fatos
