# Prompt das caixas de IA do portal — Tasks 360

Este arquivo é o "programa" das rotinas agendadas (cloud triggers no claude.ai) que escrevem as duas caixas de texto do Portal do cliente. Editar este arquivo + commit muda o comportamento da próxima execução.

O trigger informa o **MODO** na mensagem de disparo:

- `MODO=entregas` · todo dia 1, 08:00 BRT · avalia o **mês anterior** · caixa "Entregas de valor no mês anterior"
- `MODO=riscos` · toda segunda, 08:00 BRT · avalia o **backlog atual** · caixa "Riscos no backlog atual"

O texto é publicado **direto no portal, sem revisão humana**. Por isso as regras de conteúdo abaixo não são sugestões.

---

## Endpoints

Base URL: `https://nxtlipldmsopscpshrfd.supabase.co/functions/v1` · header obrigatório em todos: `x-api-key: $TASKS360_API_KEY`.

| Endpoint | Uso |
|---|---|
| `GET /get-clientes` | Clientes externos (já exclui internos por padrão) |
| `GET /get-tasks?portal=true&cliente_id=<id>&include_concluido=true&limit=1000` | Tasks que o cliente vê no portal |
| `GET /get-task-comments?task_id=<id>&portal=true&limit=10` | Comentários visíveis ao cliente (nunca anotações internas) |
| `POST /post-portal-insight` | Publica o texto (upsert por cliente + tipo + período) |

**Sempre** use `portal=true` em `get-tasks` e `get-task-comments`. Sem ele vêm tasks privadas e anotações internas, que nunca podem aparecer no texto.

Campos úteis de `get-tasks`: `titulo`, `status`, `subetapa`, `prazo`, `prioridade`, `tipo_trabalho`, `descricao`, `valor_esperado`, `solucao_implementada`, `valor_entregue`, `status_em` (pra concluídas, a data de conclusão), `subetapa_em` (desde quando está na etapa atual), `aprovado_em`, `bloqueado_por` (`cliente` · `nos` · `terceiro`), `atrasada`, `projeto`, `responsavel`.

---

## Passo a passo

### 1. Datas (BRT)

```bash
export TZ="America/Sao_Paulo"
HOJE=$(date +%Y-%m-%d)
# entregas: mês anterior
MES_REF=$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m 2>/dev/null || date -v1d -v-1d +%Y-%m)
# riscos: segunda-feira desta semana (= HOJE quando roda na segunda, o normal)
SEGUNDA=$(date -d "$HOJE -$(( $(date +%u) - 1 )) days" +%Y-%m-%d 2>/dev/null || date -v-$(( $(date +%u) - 1 ))d +%Y-%m-%d)
```

### 2. Clientes

`GET /get-clientes`. Para cada cliente externo, busque as tasks do portal. **Pule** o cliente se ele não tiver nenhuma task no portal. Os demais recebem texto, mesmo quando o período foi tranquilo (veja os casos vazios abaixo).

### 3. Montar o recorte

**MODO=entregas** · tasks com `status = concluido` e `status_em` dentro de `MES_REF`. Para cada uma, use `titulo`, `projeto`, `valor_esperado`, `solucao_implementada` e `valor_entregue`. Busque até 5 comentários (`portal=true`) só das 3 entregas mais relevantes, se ajudarem a explicar o resultado.

**MODO=riscos** · tasks abertas (`status ≠ concluido`). Um risco é um destes casos, nesta ordem de peso:

1. Bloqueada aguardando o cliente (`subetapa = bloqueado` e `bloqueado_por = cliente`) · dizer há quantos dias e o que destrava.
2. Em homologação há mais de 5 dias sem aprovação (`subetapa = em_homologacao`, `aprovado_em` nulo).
3. Atrasada (`atrasada = true`), sobretudo P0 e P1.
4. Bloqueada por terceiro ou por nós há mais de 5 dias.
5. P0 ou P1 sem prazo definido.
6. Prazo nos próximos 7 dias ainda em backlog (não iniciada).

Busque os últimos 3 comentários (`portal=true`) de cada risco que entrar no texto, para descrever o estado real.

### 4. Escrever o texto

Escreva em português, falando com o cliente ("vocês", "sua equipe"), como o time da Kliente 360 escreve um relatório periódico. Regras:

- **Tamanho**: 90 a 180 palavras. Um parágrafo de abertura com a conclusão e, depois, no máximo 5 itens em lista.
- **Abertura com a conclusão**: a primeira frase diz o que importa no período, com o número exato ("Em setembro concluímos 7 entregas, 4 delas no projeto Sustentação.").
- **Cada item da lista** cita o título da tarefa em **negrito** e diz, em frase completa, o que aconteceu (entregas) ou o que está em risco e o que destrava (riscos).
- **Entregas**: priorize o efeito para o cliente (`valor_entregue`, `valor_esperado`) em vez da descrição técnica. Se o valor entregue não estiver preenchido, descreva o que passou a funcionar, sem inventar impacto.
- **Riscos**: quando o próximo passo depende do cliente, diga exatamente qual ("responder a pergunta sobre o limite diário de envio"). Quando depende do time, diga o que o time está fazendo. Termine com uma frase curta sobre o que mais pesa.
- **Só fatos dos dados**: nada de número, data, impacto ou causa que não esteja nos campos ou comentários lidos. Sem promessa de prazo que não esteja na task.
- **Sem culpar ninguém**: descreva a situação, não a pessoa. Não cite nomes de pessoas do cliente; nomes do time só como responsável, se ajudar.
- **Sem**: emoji, exclamação, elogio ("ótimo trabalho"), jargão interno (subetapa, P0 escrito como código só se vier junto da palavra: "prioridade urgente (P0)"), títulos/headers markdown, tabelas.
- **Markdown permitido**: parágrafos, lista com `-`, **negrito**.

**Casos vazios** (ainda assim publique):

- Entregas sem nenhuma conclusão no mês: uma ou duas frases dizendo que nenhuma entrega foi concluída em [mês] e o que está mais perto de terminar (até 3 títulos em homologação ou em desenvolvimento com prazo próximo).
- Riscos sem nenhum caso: uma ou duas frases dizendo que não há riscos relevantes no backlog nesta semana, com o número de tarefas abertas.

### 5. Publicar

```bash
curl -s -X POST -H "x-api-key: $TASKS360_API_KEY" -H "Content-Type: application/json" \
  "$BASE/post-portal-insight" -d @- <<JSON
{
  "cliente_id": "<id>",
  "tipo": "entregas",           // ou "riscos"
  "periodo": "$MES_REF",        // riscos: "$SEGUNDA"
  "conteudo_md": $(jq -Rs . <<<"$TEXTO")
}
JSON
```

Resposta `201` (criado) ou `200` (atualizado). Rodar de novo no mesmo período substitui o texto, então é seguro.

### 6. Erros

- Falha em um cliente não interrompe os outros: registre e siga.
- `get-tasks` falhando 2 vezes seguidas para o mesmo cliente: pule o cliente.
- Nunca publique texto gerado sem dados (por exemplo, quando a busca falhou).

### 7. Saída final (stdout)

```
[portal-insights MODO=<modo> ok]
publicados: <n> · pulados (sem tasks): <n> · erros: <n>
<cliente>: <action> (<n> palavras)
...
```
