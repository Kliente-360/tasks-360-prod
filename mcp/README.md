# tasks360-mcp

Servidor MCP (Cloudflare Worker) que expõe a API do Tasks 360 como ferramentas para o Cowork/Claude.

Por que existe: o sandbox do Cowork bloqueia chamadas HTTP arbitrárias para `*.supabase.co`. Este Worker fica entre o Cowork e o Supabase: o Cowork conversa com o Worker via MCP, e o Worker chama as Edge Functions usando `x-api-key`.

## Ferramentas expostas

| Tool          | O que faz                                                                                |
| ------------- | ---------------------------------------------------------------------------------------- |
| `get_clientes`| Lista clientes (e projetos ativos). Use pra descartar reuniões internas e fazer name match |
| `get_pessoas` | Lista pessoas (com carga atual). Use pra validar/casar o responsável extraído das notas    |
| `get_tasks`   | Lista tasks ativas (filtra por responsável, cliente, status, prazo). Use pra resumos/relatórios |
| `get_task_comments` | Lê histórico de comentários de uma task. Use pra resumir discussões em standups            |
| `ingest_task` | Cria/atualiza task (idempotente por `external_id`)                                          |
| `post_standup` | Publica/atualiza o standup diário (upsert por `data`)                                       |
| `get_standups` | Lê standups publicados (mais recente primeiro; filtra por `data` pra puxar um dia específico) |

### `get_tasks` — filtros disponíveis

Todos opcionais. Sem nenhum filtro, retorna as 100 primeiras tasks ativas (status ≠ `concluido`).

| Param              | Tipo                                              | Notas                                                            |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| `pessoa`           | UUID ou nome (case-insensitive)                   | First-name funciona (ex: `"Jéssica"`)                            |
| `status`           | array de `backlog\|andamento\|bloqueado\|concluido` | Default exclui `concluido`                                       |
| `include_concluido`| boolean                                           | Atalho pra incluir concluídas sem listar todos os status         |
| `cliente_id`       | UUID                                              | Precedência sobre `cliente`                                      |
| `cliente`          | nome (case-insensitive)                           | Use o nome canônico de `get_clientes`                            |
| `projeto_id`       | UUID                                              | —                                                                |
| `prazo_de`         | `YYYY-MM-DD`                                      | prazo ≥ data                                                     |
| `prazo_ate`        | `YYYY-MM-DD`                                      | prazo ≤ data                                                     |
| `limit`            | int 1–200                                         | Default 100                                                      |

Retorna `{ tasks: [...], total }`. Cada task traz `cliente`, `projeto` e `responsavel` já resolvidos por nome, mais a flag `atrasada` (prazo < hoje e não concluída).

### `get_task_comments` — parâmetros

| Param      | Tipo      | Notas                                       |
| ---------- | --------- | ------------------------------------------- |
| `task_id`  | UUID      | Obrigatório. Pegue do campo `id` de `get_tasks` |
| `limit`    | int 1–200 | Default 100                                 |

Retorna `{ comentarios: [{id, autor, data, texto}], total }`, ordenado do mais recente pro mais antigo. `autor` vem resolvido via `pessoas.nome` (com fallback no campo `author` text quando vier de cliente externo sem `author_pessoa_id`). `data` usa `posted_em` quando disponível, senão `criado_em`.

## Pré-requisitos

- Node.js 18+ e npm instalados (verifique com `node -v`)
- Conta gratuita no Cloudflare ([cloudflare.com](https://cloudflare.com)) — sem cartão necessário pro free tier

## Setup (uma vez)

```bash
cd "tasks360-mcp"

# 1. Instalar dependências
npm install

# 2. Logar no Cloudflare (abre o navegador)
npx wrangler login

# 3. Definir os secrets (NÃO commitar essas chaves no git)
#    - TASKS360_API_KEY: sua chave da lista INGEST_API_KEYS no Supabase
#    - MCP_AUTH_TOKEN: gere um token aleatório forte (ex: openssl rand -hex 32)
npx wrangler secret put TASKS360_API_KEY
npx wrangler secret put MCP_AUTH_TOKEN

# 4. Deploy
npx wrangler deploy
```

Ao final do deploy o Wrangler imprime a URL pública, algo como:

```
https://tasks360-mcp.<seu-subdominio>.workers.dev
```

Guarde essa URL — você vai usar logo abaixo.

## Conectar no Cowork

No Cowork desktop, vá em **Settings → Connectors → Add custom MCP** (ou edite manualmente o arquivo de config) e adicione:

- **Name:** `tasks360`
- **URL:** `https://tasks360-mcp.<seu-subdominio>.workers.dev/mcp`
- **Header:** `Authorization: Bearer <MCP_AUTH_TOKEN que você gerou>`

Reinicie o Cowork. Depois disso, em uma conversa nova, peça pra mim "lista os clientes do Tasks 360" — devo conseguir chamar `get_clientes` e devolver a lista.

## Atualizando

Mexeu no código? `npx wrangler deploy` (mesma URL, deploy novo).

Mexeu nos secrets? Use `npx wrangler secret put NOME` de novo.

## Custos

Free tier do Cloudflare Workers: 100 mil requisições/dia + 10ms CPU/req. Esse MCP usa de longe muito menos que isso.
