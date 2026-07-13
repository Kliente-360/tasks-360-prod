/**
 * Tasks 360 MCP Server (Cloudflare Worker)
 *
 * Expõe ferramentas que dão proxy seguro às Edge Functions do Supabase:
 *   - get_clientes      : lista clientes (e opcionalmente projetos ativos)
 *   - get_pessoas       : lista pessoas (filtra por cliente, opcionalmente carga atual)
 *   - get_tasks         : lista tasks com filtros (responsável, cliente, status, prazo…)
 *   - get_task_comments : lê comentários de uma task (resumo/histórico)
 *   - ingest_task       : cria/atualiza task (idempotente por external_id)
 *   - post_standup      : publica/atualiza standup diário (upsert por data)
 *   - get_standups      : lê standups publicados (mais recente primeiro)
 *
 * Auth: o cliente MCP (Cowork) precisa enviar `Authorization: Bearer <MCP_AUTH_TOKEN>`.
 * Esse token é diferente da TASKS360_API_KEY (essa fica só no Worker).
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface Env {
  TASKS360_BASE_URL: string;     // var pública (wrangler.toml)
  TASKS360_API_KEY: string;      // secret (wrangler secret put)
  MCP_AUTH_TOKEN: string;        // secret (wrangler secret put)
  MCP_OBJECT: DurableObjectNamespace;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers para chamar a API Supabase
// ──────────────────────────────────────────────────────────────────────────

async function callTasks360(
  env: Env,
  method: "GET" | "POST",
  path: string,
  query?: Record<string, string | undefined>,
  body?: unknown,
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  const url = new URL(`${env.TASKS360_BASE_URL}/functions/v1/${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { "x-api-key": env.TASKS360_API_KEY };
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* mantém como texto se não for JSON */
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: typeof parsed === "string" ? parsed : JSON.stringify(parsed) };
  }
  return { ok: true, status: res.status, data: parsed };
}

function toolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(message: string, details?: unknown) {
  return {
    isError: true,
    content: [
      { type: "text" as const, text: `ERROR: ${message}${details ? `\n${JSON.stringify(details, null, 2)}` : ""}` },
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Schemas dos parâmetros
// ──────────────────────────────────────────────────────────────────────────

const getClientesSchema = {
  with_projetos: z
    .boolean()
    .optional()
    .describe("Se true, inclui a lista de projetos ativos de cada cliente. Default: true."),
};

const getPessoasSchema = {
  cliente_id: z
    .string()
    .optional()
    .describe("UUID do cliente. Se passado, retorna apenas pessoas vinculadas a esse cliente (principal ou secundário)."),
  with_load: z
    .boolean()
    .optional()
    .describe("Se true, retorna tasks_ativas e horas_pendentes para balanceamento. Default: true."),
};

const getTasksSchema = {
  pessoa: z
    .string()
    .optional()
    .describe(
      "Filtra por responsável. Aceita UUID exato (pessoa_id de get_pessoas) ou nome case-insensitive (first-name). Omitir = todas as pessoas.",
    ),
  status: z
    .array(z.enum(["backlog", "andamento", "bloqueado", "concluido"]))
    .optional()
    .describe(
      "Filtra por status macro. Default exclui 'concluido' (só tasks ativas). Passe ['concluido'] explicitamente ou use include_concluido=true pra ver concluídas.",
    ),
  include_concluido: z
    .boolean()
    .optional()
    .describe("Se true, inclui tasks concluídas no resultado (ignora o default de excluir 'concluido'). Útil pra relatórios históricos."),
  prazo_de: z
    .string()
    .optional()
    .describe("Filtro de prazo >= data (YYYY-MM-DD)."),
  prazo_ate: z
    .string()
    .optional()
    .describe("Filtro de prazo <= data (YYYY-MM-DD). Combine com prazo_de pra janelas (ex: tasks vencendo nessa semana)."),
  cliente_id: z
    .string()
    .optional()
    .describe("Filtra por cliente (UUID). Tem precedência sobre o param 'cliente' se ambos forem passados."),
  cliente: z
    .string()
    .optional()
    .describe("Filtra por cliente (nome case-insensitive). Use o nome canônico de get_clientes."),
  projeto_id: z
    .string()
    .optional()
    .describe("Filtra por projeto (UUID)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Máximo de tasks retornadas. Default 100, máximo 200."),
};

const getTaskCommentsSchema = {
  task_id: z
    .string()
    .uuid("task_id deve ser um UUID válido (use o campo 'id' retornado por get_tasks).")
    .describe("UUID da task. Pegue do campo 'id' retornado por get_tasks."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Máximo de comentários retornados. Default 100, máximo 200."),
};

const ingestTaskSchema = {
  external_id: z
    .string()
    .describe(
      "ID externo deterministico para idempotência. Use o formato 'cowork-<email_message_id>-<index_action_item>' para que reprocessar o mesmo email não duplique a task.",
    ),
  titulo: z.string().describe("Título curto da task (uma frase imperativa)."),
  descricao: z.string().optional().describe("Descrição/contexto extraído das notas da reunião."),
  cliente: z
    .string()
    .optional()
    .describe("Nome do cliente — match case-insensitive contra o campo 'nome' retornado por get_clientes. Omitir (ou enviar string vazia) cria a task sem cliente — a API aceita 'Triagem' como label genérico para ambíguos."),
  projeto: z
    .string()
    .optional()
    .describe("Nome do projeto — match case-insensitive contra o campo 'nome' do projeto."),
  responsavel: z
    .string()
    .optional()
    .describe(
      "First-name da pessoa (exatamente como aparece em get_pessoas, antes do espaço). Omitir se não houver responsável claro nas notas.",
    ),
  prioridade: z.enum(["P0", "P1", "P2", "P3"]).optional().describe("Prioridade. Default geralmente é P2."),
  esforco: z.number().optional().describe("Estimativa em horas."),
  prazo: z
    .string()
    .optional()
    .describe("Data limite no formato YYYY-MM-DD (timezone do app)."),
  subetapa: z.string().optional().describe("Ex: backlog, em_andamento, etc. Default: backlog."),
  complexidade: z.enum(["baixa", "media", "alta"]).optional(),
  tipo_trabalho: z.string().optional().describe("Ex: feature, bug, chore, suporte..."),
  tags: z.array(z.string()).optional(),
  criado_por_ia: z
    .boolean()
    .optional()
    .describe("Marque true quando a task vier de uma extração automática (Cowork). Default: true."),
};

const postStandupSchema = {
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD.")
    .describe("Data do standup no formato YYYY-MM-DD. Chave do upsert — publicar de novo nessa data substitui o conteúdo."),
  conteudo_md: z
    .string()
    .describe("Conteúdo principal do standup em Markdown. Pode incluir headings, bullets, links — o que rolar."),
  texto_whatsapp: z
    .string()
    .optional()
    .describe("Versão enxuta pra compartilhar no grupo de WhatsApp (sem markdown pesado, com emojis se quiser). Opcional."),
  resumo: z
    .string()
    .optional()
    .describe("TL;DR curto (1–2 frases) pra listagens. Opcional."),
};

const getStandupsSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(90)
    .optional()
    .describe("Máximo de standups retornados. Default 30, máximo 90."),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD.")
    .optional()
    .describe("Se passada, retorna apenas o standup daquele dia exato (YYYY-MM-DD)."),
};

// ──────────────────────────────────────────────────────────────────────────
// MCP Agent
// ──────────────────────────────────────────────────────────────────────────

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "tasks360",
    version: "0.1.0",
  });

  async init() {
    // ───── get_clientes ────────────────────────────────────────────────
    this.server.tool(
      "get_clientes",
      "Lista os clientes do Tasks 360. Use ANTES de criar uma task para descobrir o nome canônico do cliente e seus projetos ativos. Inclui flag eh_interno (descartar reuniões 100% internas).",
      getClientesSchema,
      async ({ with_projetos }) => {
        const result = await callTasks360(this.env, "GET", "get-clientes", {
          with_projetos: String(with_projetos ?? true),
        });
        if (!result.ok) return toolError(`get-clientes falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_pessoas ─────────────────────────────────────────────────
    this.server.tool(
      "get_pessoas",
      "Lista pessoas (responsáveis em potencial). Quando souber o cliente, passe cliente_id pra reduzir a lista. Use o campo 'nome' (primeiro token = first name) para casar com nomes mencionados nas notas. Se uma pessoa cujo first-name foi mencionada não estiver na lista, NÃO atribua a task.",
      getPessoasSchema,
      async ({ cliente_id, with_load }) => {
        const result = await callTasks360(this.env, "GET", "get-pessoas", {
          cliente_id,
          with_load: String(with_load ?? true),
        });
        if (!result.ok) return toolError(`get-pessoas falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_tasks ───────────────────────────────────────────────────
    this.server.tool(
      "get_tasks",
      "Lista tasks do Tasks 360 com filtros (responsável, cliente, status, prazo). Por padrão retorna só tasks ATIVAS (exclui status 'concluido'). Use pra responder perguntas tipo 'quais tasks P0 abertas do cliente X', 'o que a Jéssica tem pra essa semana', 'quantas tasks vencendo até sexta'. Retorna `{ tasks: [...], total }`; cada task traz cliente/projeto/responsavel já resolvidos por nome, mais flag `atrasada`. Para resumos agregue no lado do consumidor (a API não agrupa).",
      getTasksSchema,
      async ({ pessoa, status, include_concluido, prazo_de, prazo_ate, cliente_id, cliente, projeto_id, limit }) => {
        const result = await callTasks360(this.env, "GET", "get-tasks", {
          pessoa,
          status: status && status.length > 0 ? status.join(",") : undefined,
          include_concluido: include_concluido !== undefined ? String(include_concluido) : undefined,
          prazo_de,
          prazo_ate,
          cliente_id,
          cliente,
          projeto_id,
          limit: limit !== undefined ? String(limit) : undefined,
        });
        if (!result.ok) return toolError(`get-tasks falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_task_comments ───────────────────────────────────────────
    this.server.tool(
      "get_task_comments",
      "Lê o histórico de comentários de uma task específica, ordenado do mais recente pro mais antigo. Use pra resumir o status de uma task em standups, dar contexto de discussões anteriores, ou entender por que algo foi decidido. Pegue o task_id no campo 'id' retornado por get_tasks. Retorna `{ comentarios: [{id, autor, data, texto}], total }` — `autor` vem como nome resolvido via get_pessoas (com fallback no texto livre quando o comentário é de cliente externo).",
      getTaskCommentsSchema,
      async ({ task_id, limit }) => {
        const result = await callTasks360(this.env, "GET", "get-task-comments", {
          task_id,
          limit: limit !== undefined ? String(limit) : undefined,
        });
        if (!result.ok) return toolError(`get-task-comments falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── ingest_task ─────────────────────────────────────────────────
    this.server.tool(
      "ingest_task",
      "Cria (ou atualiza, se external_id já existe) uma task no Tasks 360. SEMPRE use external_id deterministico para evitar duplicatas em re-execuções. Cliente, projeto e responsável são casados por nome (case-insensitive) — use os valores exatos retornados por get_clientes/get_pessoas.",
      ingestTaskSchema,
      async (args) => {
        // Defaults sensatos
        const body = {
          criado_por_ia: true,
          ...args,
        };
        const result = await callTasks360(this.env, "POST", "ingest-task", undefined, body);
        if (!result.ok) return toolError(`ingest-task falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── post_standup ────────────────────────────────────────────────
    this.server.tool(
      "post_standup",
      "Publica/atualiza o standup diário (upsert por data). A `data` é a chave — chamar de novo com a mesma data substitui o standup daquele dia. `conteudo_md` é o texto principal em Markdown; `texto_whatsapp` e `resumo` são opcionais. Retorna `{ id, data, atualizado_em, action: 'created'|'updated' }`.",
      postStandupSchema,
      async ({ data, conteudo_md, texto_whatsapp, resumo }) => {
        const body: Record<string, unknown> = { data, conteudo_md };
        if (texto_whatsapp !== undefined) body.texto_whatsapp = texto_whatsapp;
        if (resumo !== undefined) body.resumo = resumo;
        const result = await callTasks360(this.env, "POST", "post-standup", undefined, body);
        if (!result.ok) return toolError(`post-standup falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_standups ────────────────────────────────────────────────
    this.server.tool(
      "get_standups",
      "Lê os standups diários publicados, ordenados do mais recente pro mais antigo. Use pra revisar o que foi dito nos últimos dias, ou (passando `data=YYYY-MM-DD`) puxar o standup de um dia específico. Retorna `{ standups: [...], total }` direto do endpoint.",
      getStandupsSchema,
      async ({ limit, data }) => {
        const result = await callTasks360(this.env, "GET", "get-standups", {
          limit: limit !== undefined ? String(limit) : undefined,
          data,
        });
        if (!result.ok) return toolError(`get-standups falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Worker fetch handler — autenticação por bearer token + roteamento MCP
// ──────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Healthcheck
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("tasks360-mcp ok", { status: 200 });
    }

    // Autenticação (qualquer rota /sse ou /mcp)
    if (url.pathname.startsWith("/sse") || url.pathname.startsWith("/mcp")) {
      const auth = request.headers.get("authorization") ?? "";
      const expected = `Bearer ${env.MCP_AUTH_TOKEN}`;
      if (!env.MCP_AUTH_TOKEN || auth !== expected) {
        return new Response("unauthorized", { status: 401 });
      }
    }

    // SSE transport (compatibilidade com clientes legacy)
    if (url.pathname.startsWith("/sse")) {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    // Streamable HTTP transport (recomendado, mais novo)
    if (url.pathname.startsWith("/mcp")) {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("not found", { status: 404 });
  },
};
