# Prompt do standup diário — Tasks 360

Este arquivo é o "programa" da rotina agendada que gera o standup todo dia útil às 08:00 BRT. O `/schedule` skill do Claude Code aponta pra cá. Editar este arquivo + commit é tudo o que precisa pra mudar o comportamento da próxima execução.

---

## Instruções pro agent

Monte o standup diário do time da Kliente 360 a partir do MCP `tasks360` e publique no app. Siga **exatamente** o passo a passo abaixo, sem improviso.

### 1. Datas (BRT · UTC-3 fixo)

- `HOJE` = data atual em BRT no formato `YYYY-MM-DD`
- `ONTEM` = `HOJE - 1` dia
- `FIM` = `HOJE + 4` dias

### 2. Fetch dos dados base

Em paralelo:

```
ATRASADAS    = mcp__tasks360__get_tasks({ prazo_ate: ONTEM, limit: 200 })
CURTO_PRAZO  = mcp__tasks360__get_tasks({ prazo_de: HOJE, prazo_ate: FIM, limit: 200 })
CARGA        = mcp__tasks360__get_pessoas({ with_load: true })
```

### 3. Identificar tasks críticas + buscar comments

**Crítica** = `prioridade ∈ {P0, P1}` OU `status = "bloqueado"`.

Pra cada task crítica (cap **30** · lotes de **5 paralelos**), busca:

```
mcp__tasks360__get_task_comments({ task_id, limit: 3 })
```

Marca a task como **"pede ajuda"** se algum dos 3 comments mais recentes casar (case-insensitive) com:

```
/ajud|apoio|preciso|precisamos|depende|aguardando|pendente|@\w+/
```

Resume o **status atual** da task em **1 frase**, baseado no comment mais recente.

### 4. Compor `conteudo_md`

Markdown **sem emoji** (vai pro app · superfície de marca). Tom direto, português.

Estrutura:

```markdown
# Standup — <dia da semana>, <DD/MM/AAAA>

**Atenção:** <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo_ate_fim> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda.
Maior carga pendente: <Nome1> (<h1>h) · <Nome2> (<h2>h) · <Nome3> (<h3>h).

## <Nome> — <N> atrasadas

- **<P0|P1> · <Título>** (<Cliente>) — atrasada <N>d / vence <DD/MM>. <Status pelo último comment em 1 frase.> [(pede ajuda)] [(bloqueada)]
- ... (todas as P0/P1 atrasadas + curto prazo dessa pessoa)
- Bloqueadas (N): <resumo das bloqueadas de menor prioridade em 1 linha>
- +N P2/P3 atrasadas (<3 títulos curtos em parênteses>)

→ <Nome>, status e onde precisa de apoio?

## <Próxima pessoa> — ...

(repete por responsável, ordenado por nº atrasadas DESC)

---

*Respondam aqui ou no grupo com status atual e onde precisam de apoio.*
```

Regras:
- Ordenar pessoas por nº de atrasadas (desc)
- Detalhar P0/P1 da pessoa (atrasadas + curto prazo) com prioridade, título, cliente, prazo, flags e status
- Bloqueadas de menor prioridade: resumir em 1 bullet
- P2/P3 atrasadas: só contagem `+N P2/P3 atrasadas (titulo1, titulo2, titulo3)`
- Encerrar bloco de cada pessoa com pergunta direta

### 5. Compor `texto_whatsapp`

Versão pra colar no grupo do WhatsApp. Pode usar **negrito** (`*texto*`), bullets `•`, setas `→`, no máximo **2-3 emojis funcionais** (📌, 🚨, 🙏 etc).

Estrutura sugerida:

```
*Standup Tasks 360 — <dia>, <DD/MM>*

📌 <n_atrasadas> atrasadas · <n_bloqueadas> bloqueadas · <n_vencendo> vencendo até <DD/MM> · <n_pedem_ajuda> pedem ajuda
Maior carga: <Nome1> (<h>h) · <Nome2> (<h>h) · <Nome3> (<h>h)

*<Nome>* — <N> atrasadas
• <P0|P1> <Título curto> (<Cliente>) — <prazo em palavra>
• ...
→ <Nome>, status e onde precisa de apoio?

(repete por responsável · só destaques P0/P1)

Respondam com status e onde precisam de ajuda. Valeu! 🙏
```

### 6. Compor `resumo`

TL;DR de **1-2 frases**. Mencionar: nº atrasadas/bloqueadas, top de carga, quantas pedem ajuda.

Exemplo:
```
40 tarefas atrasadas e 10 bloqueadas; carga concentrada em Felipe (273h), Henrique (261h) e Drieli (237h). 4 itens pedem apoio.
```

### 7. Publicar

```
mcp__tasks360__post_standup({
  data: HOJE,            // YYYY-MM-DD
  conteudo_md: <markdown>,
  texto_whatsapp: <texto>,
  resumo: <tl;dr>
})
```

`post_standup` faz UPSERT por `data` — se já existir standup pra hoje, ele substitui (não duplica).

### 8. Fallback em erro

Se `mcp__tasks360__get_tasks` falhar **2 vezes consecutivas**:

1. Publica conteudo_md mínimo:
   ```
   # Standup — <DD/MM/AAAA>
   Standup não pôde ser gerado automaticamente. Equipe, favor consultar o Briefing direto no app.
   ```
2. `resumo`: `"Erro automatizado — consultar Briefing."`
3. `texto_whatsapp`: `null`
4. Retorna exit code 1 (pra ficar visível nos logs do `/schedule`)

### 9. Output stdout final

Sempre printa um resumo enxuto pro log do `/schedule`:

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
- **Nunca** opinar sobre desempenho · só descrever fatos (atrasada N dias, último comment diz X)
