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
| `update_task` | Atualiza qualquer task pelo `task_id`: subetapa/status, valor entregue, solução, horas realizadas |
| `add_task_comment` | Posta comentário numa task pelo `task_id`; interno por padrão, `visivel_cliente: true` mostra ao cliente |
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

### `update_task` — parâmetros

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `task_id` | uuid | Obrigatório. Campo `id` de `get_tasks` |
| `subetapa` | enum | Uma das 11 subetapas; o status (macro) é derivado dela |
| `status` | enum | `backlog`, `andamento`, `bloqueado`, `concluido`. Prefira `subetapa`; só o status leva à subetapa padrão do macro (ou mantém a atual se já estiver nele) |
| `bloqueado_por` | enum | `nos` (padrão), `cliente`, `terceiro` — quando a subetapa for `bloqueado` |
| `valor_entregue` | string | Substitui o valor atual |
| `solucao_implementada` | string | Substitui o valor atual |
| `tempo_real_horas` | number | Total de horas realizadas (substitui, não soma) |

Edge Function: `update-task`. Cada mudança entra em `task_field_history` com `actor_source = 'mcp'` e o autor vem do e-mail do login OAuth. Task do Salesforce com webhook ligado (VB, CTF, Bodytech) envia `task.updated` para a org do cliente, igual a uma edição no app.

### `add_task_comment` — parâmetros

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `task_id` | uuid | Obrigatório. Campo `id` de `get_tasks` |
| `texto` | string | Obrigatório, até 10.000 caracteres |
| `visivel_cliente` | boolean | Padrão `false` (interno). `true`: aparece no portal, os usuários do cliente recebem aviso e, em task do Salesforce com webhook, vira `comment.created` na org do cliente |

Edge Function: `add-task-comment`. Interno por padrão. Autor = pessoa do e-mail do login OAuth (ou "Claude (MCP)"). O responsável da task recebe aviso no sino.

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

## Autenticação (OAuth com Google)

O Worker é um authorization server OAuth 2.1 (lib `@cloudflare/workers-oauth-provider`). Quem conecta o MCP faz login com a conta Google; só entram contas verificadas do domínio `ALLOWED_DOMAIN` (`kliente360.com`). Os grants e tokens ficam no KV `OAUTH_KV`, com hash e criptografia.

Rotas: `/authorize` (tela de consentimento), `/callback` (volta do Google), `/token`, `/register` (registro dinâmico de clientes) e os `/.well-known/*` de descoberta. O código do login está em `src/google-handler.ts`.

### Setup do OAuth (uma vez)

```bash
# KV dos tokens: copie o id impresso para o wrangler.toml ([[kv_namespaces]] OAUTH_KV)
npx wrangler kv namespace create OAUTH_KV

# Credenciais do OAuth Client do Google (tipo "Aplicativo da Web",
# redirect URI: https://tasks360-mcp.felipe-kliente360.workers.dev/callback)
jq -r .web.client_id     client_secret_XXXX.json | npx wrangler secret put GOOGLE_CLIENT_ID
jq -r .web.client_secret client_secret_XXXX.json | npx wrangler secret put GOOGLE_CLIENT_SECRET

npx wrangler deploy
```

### Conectar (jeito novo, vale pro time todo)

Um owner/admin do Team adiciona em **claude.ai → Customize → Connectors → Add custom connector** a URL `https://tasks360-mcp.felipe-kliente360.workers.dev/mcp`, sem preencher client ID/secret. Cada pessoa clica em conectar e loga com a conta @kliente360.com. Vale no claude.ai, no app, no Cowork e no Claude Code logado com a conta claude.ai.

### Token legado

O `Authorization: Bearer <MCP_AUTH_TOKEN>` continua aceito só durante a migração. Quando ninguém mais usar o `mcp-remote` com `--header`, desligue com `npx wrangler secret delete MCP_AUTH_TOKEN`.

## Conectar no Cowork (legado, via token)

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
