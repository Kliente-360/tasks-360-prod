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

Campos úteis de `get-tasks`: `id`, `titulo`, `status`, `subetapa`, `prazo`, `prioridade`, `tipo_trabalho`, `descricao`, `valor_esperado`, `solucao_implementada`, `valor_entregue`, `status_em` (pra concluídas, a data de conclusão), `subetapa_em` (desde quando está na etapa atual), `aprovado_em`, `bloqueado_por` (`cliente` · `nos` · `terceiro`), `bloqueada_por_tasks` (ids das tasks que precisam terminar antes), `atrasada`, `projeto`, `responsavel`.

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

**MODO=entregas** · tasks com `status = concluido` e `status_em` dentro de `MES_REF`.

Para cada entrega, os três campos centrais são:

- `valor_esperado`: o que o cliente queria ganhar quando pediu;
- `solucao_implementada`: o que o time de fato construiu;
- `valor_entregue`: o resultado que a entrega gerou.

Use `titulo`, `projeto`, `tipo_trabalho` e `descricao` como contexto quando esses campos estiverem vazios. Busque até 5 comentários (`portal=true`) das entregas mais relevantes se ajudarem a entender o resultado.

**MODO=riscos** · tasks abertas (`status ≠ concluido`). Para cada uma, calcule os sinais:

- **Atraso**: `atrasada` e quantos dias de atraso (`HOJE − prazo`).
- **Prazo próximo**: prazo nos próximos 7 dias.
- **Prioridade**: P0 e P1 pesam mais.
- **Dependência**: `bloqueada_por_tasks` lista tasks que precisam terminar antes. Uma dependência é risco quando a task da qual ela depende está aberta, atrasada ou bloqueada; o atraso de uma passa para a outra. Trate a cadeia como um risco só.
- **Bloqueio**: `subetapa = bloqueado`, com `bloqueado_por` (`cliente`, `terceiro` ou `nos`) e há quantos dias (`HOJE − subetapa_em`).
- **Tempo parada**: dias desde `subetapa_em` na etapa atual. Em desenvolvimento ou revisão há mais de 10 dias, ou em homologação há mais de 5 dias sem aprovação, é sinal de travamento.
- **Silêncio**: dias desde o último comentário visível (`get-task-comments?portal=true`). Task ativa sem comentário há mais de 10 dias reforça o travamento.

Escolha até 5 riscos, pesando nesta ordem: o que impede uma entrega importante (P0/P1 atrasada ou em cadeia de dependência), o que depende do cliente agir, o que está parado há mais tempo, o que vence nos próximos dias. Leia os últimos 3 comentários (`portal=true`) de cada escolhido para descrever o estado real, e use o que eles dizem sobre causa e próximo passo.

### 4. Escrever o texto

Escreva em português, falando com o cliente ("vocês", "sua equipe"), como o time da Kliente 360 escreve um relatório periódico.

**MODO=entregas · um compilado do mês para o negócio do cliente, não uma lista de tarefas.**

- Agrupe as entregas pelo efeito no negócio (por exemplo: atendimento, vendas, operação, dados), inferido de `valor_esperado`, `solucao_implementada` e `valor_entregue`. Duas a quatro frentes, cada uma num item.
- Abertura (1 parágrafo): o que ficou melhor para o negócio no mês, com o número exato de entregas e onde se concentraram ("Em setembro concluímos 7 entregas, a maioria no atendimento: o SAC passou a…").
- Cada item: o que mudou na operação do cliente, ligando o que era esperado ao que foi entregue, e citando as entregas em **negrito**. Quando `valor_entregue` existir, ele é a frase principal; quando não existir, descreva o que passou a funcionar, sem inventar impacto ou número.
- Se houver correções de erro, junte-as numa frase ("também corrigimos 3 falhas no fluxo de e-mail") em vez de um item por correção.
- Fecho (1 frase, opcional): o que está para chegar, se houver task em homologação.
- Tamanho: 120 a 220 palavras.

**MODO=riscos · uma leitura do que pode atrasar as próximas entregas e o que destrava.**

- Abertura (1 parágrafo): a avaliação geral com números exatos (tarefas abertas, quantas atrasadas) e o risco que mais pesa.
- Cada item: título da task em **negrito**, o que está em risco (data, dias de atraso ou dias parada), por quê (bloqueio, dependência, silêncio, falta de resposta) e o que destrava. Quando depende do cliente, diga exatamente qual ação ("responder a pergunta sobre o limite diário de envio"). Quando depende do time ou de terceiro, diga o que está sendo feito, com base nos comentários.
- Cadeia de dependência num item só: "**A** depende de **B**, que está bloqueada desde 02/10; enquanto B não andar, A não começa".
- Tamanho: 90 a 180 palavras, no máximo 5 itens.

**Regras para os dois modos:**

- **Só fatos dos dados**: nada de número, data, impacto ou causa que não esteja nos campos ou comentários lidos. Sem promessa de prazo que não esteja na task.
- **Sem culpar ninguém**: descreva a situação, não a pessoa. Não cite nomes de pessoas do cliente; nomes do time só como responsável, se ajudar.
- **Sem**: emoji, exclamação, elogio ("ótimo trabalho"), jargão interno (prioridade só como "urgente (P0)" ou "alta (P1)"), títulos markdown, tabelas.
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
