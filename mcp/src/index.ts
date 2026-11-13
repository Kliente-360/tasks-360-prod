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
 *   - log_horas         : lança horas no Timesheet (data + duração + nota)
 *   - get_horas         : lê lançamentos do Timesheet com totais por pessoa e cliente
 *
 * Auth (dois caminhos aceitos em /mcp):
 *   1. OAuth 2.1 com login Google restrito a ALLOWED_DOMAIN. É o que o connector do
 *      claude.ai (e, por tabela, Claude Code e Cowork) usa. Ver src/google-handler.ts.
 *   2. Legado: `Authorization: Bearer <MCP_AUTH_TOKEN>`, mantido durante a migração
 *      (mcp-remote no Claude Desktop). Para desligar, apague o secret MCP_AUTH_TOKEN.
 * A TASKS360_API_KEY continua só no Worker; o cliente MCP nunca a vê.
 */

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { googleHandler, GRANTED_SCOPES, type AuthEnv, type UserProps } from "./google-handler";

// URL pública do endpoint MCP. Precisa bater com a URL do Worker em produção.
const MCP_RESOURCE = "https://tasks360-mcp.felipe-kliente360.workers.dev/mcp";

interface Env extends AuthEnv {
  TASKS360_BASE_URL: string;     // var pública (wrangler.toml)
  ALLOWED_DOMAIN: string;        // var pública (wrangler.toml): domínio Google aceito no login
  TASKS360_API_KEY: string;      // secret (wrangler secret put)
  MCP_AUTH_TOKEN?: string;       // secret legado; apagar quando todo mundo migrar pro OAuth
  GOOGLE_CLIENT_ID: string;      // secret (wrangler secret put)
  GOOGLE_CLIENT_SECRET: string;  // secret (wrangler secret put)
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;         // grants e tokens do OAuth (wrangler.toml)
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers para chamar a API Supabase
// ──────────────────────────────────────────────────────────────────────────

async function callTasks360(
  env: Env,
  user: Partial<UserProps> | undefined,
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
  // Quem está chamando (informativo; as Edge Functions podem usar pra auditoria)
  if (user?.email) headers["x-tasks360-user"] = user.email;
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
    .max(1000)
    .optional()
    .describe("Máximo de tasks retornadas. Default 100, máximo 1000. Use valores altos (500-1000) só pra análises históricas completas — a tabela tem ~700 tasks acumuladas."),
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
  tipo_trabalho: z.string().optional().describe("Ex: feature, bug, chore, suporte..."),
  tags: z.array(z.string()).optional(),
  criado_por_ia: z
    .boolean()
    .optional()
    .describe("Marque true quando a task vier de uma extração automática (Cowork). Default: true."),
};

const AREAS_TECNICAS = [
  "configuracao", "automacao", "canais_ia", "marketing", "integracao", "frontend", "consultoria", "relatorios",
] as const;

const SUBETAPAS = [
  "backlog", "priorizado", "em_definicao", "escopo_definido",
  "em_desenvolvimento", "em_homologacao", "em_revisao", "pronto_producao",
  "em_implantacao", "bloqueado", "concluido",
] as const;

const updateTaskSchema = {
  task_id: z
    .string()
    .uuid()
    .describe("UUID da task (campo 'id' retornado por get_tasks). Funciona para qualquer task, com ou sem external_id."),
  subetapa: z
    .enum(SUBETAPAS)
    .optional()
    .describe(
      "Nova subetapa. O status (macro) é derivado dela: backlog/priorizado/em_definicao/escopo_definido → backlog; em_desenvolvimento/em_homologacao/em_revisao/pronto_producao/em_implantacao → andamento; bloqueado; concluido.",
    ),
  status: z
    .enum(["backlog", "andamento", "bloqueado", "concluido"])
    .optional()
    .describe(
      "Status macro. Prefira `subetapa`. Se vier só o status, a task vai para a subetapa padrão do macro (andamento → em_desenvolvimento), ou mantém a atual se já estiver nesse macro.",
    ),
  bloqueado_por: z
    .enum(["nos", "cliente", "terceiro"])
    .optional()
    .describe("Quem bloqueia, quando a subetapa for 'bloqueado'. Padrão: 'nos'."),
  valor_entregue: z
    .string()
    .optional()
    .describe("Valor entregue ao negócio, em texto. Substitui o valor atual."),
  solucao_implementada: z
    .string()
    .optional()
    .describe("O que foi feito / solução implementada, em texto. Substitui o valor atual."),
  tempo_real_horas: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe("Total de horas realizadas na task (substitui o valor atual, não soma)."),
  area_tecnica: z
    .enum(AREAS_TECNICAS)
    .nullable()
    .optional()
    .describe("Área técnica da task (escolha única). null limpa."),
};

const addTaskCommentSchema = {
  task_id: z
    .string()
    .uuid()
    .describe("UUID da task (campo 'id' retornado por get_tasks)."),
  texto: z
    .string()
    .min(1)
    .max(10000)
    .describe("Texto do comentário."),
  visivel_cliente: z
    .boolean()
    .optional()
    .describe(
      "Padrão false (interno). true: aparece no portal do cliente, os usuários do cliente recebem aviso e, em task do Salesforce (VB, CTF, Bodytech), o comentário vai para a org do cliente. Só use true quando a mensagem for para o cliente ler.",
    ),
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

const logHorasSchema = {
  task_id: z
    .string()
    .uuid()
    .describe("UUID da task (campo 'id' retornado por get_tasks)."),
  horas: z
    .number()
    .min(0.02)
    .max(24)
    .optional()
    .describe("Duração em horas decimais (1.5 = 1h30). Use horas OU minutos."),
  minutos: z
    .number()
    .int()
    .min(1)
    .max(1440)
    .optional()
    .describe("Duração em minutos. Tem precedência sobre horas."),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "data deve estar no formato YYYY-MM-DD.")
    .optional()
    .describe("Dia do trabalho (YYYY-MM-DD, fuso de São Paulo). Padrão: hoje. Não aceita data futura."),
  nota: z
    .string()
    .min(5)
    .max(2000)
    .describe("O que foi feito, em uma frase (mínimo 5 caracteres). Aparece no Timesheet."),
  pessoa: z
    .string()
    .optional()
    .describe("Para quem são as horas (nome ou UUID de get_pessoas). Padrão: a pessoa logada no MCP. Lançar para outra pessoa só funciona para admin."),
};

const getHorasSchema = {
  de: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Início do período (YYYY-MM-DD). Padrão: 6 dias atrás."),
  ate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Fim do período (YYYY-MM-DD). Padrão: hoje."),
  pessoa: z.string().optional().describe("Filtra por pessoa (nome ou UUID)."),
  cliente: z.string().optional().describe("Filtra por cliente (nome exato de get_clientes)."),
  task_id: z.string().uuid().optional().describe("Filtra por uma task."),
  limit: z.number().int().min(1).max(1000).optional().describe("Máximo de lançamentos. Padrão 200."),
};

// ──────────────────────────────────────────────────────────────────────────
// MCP Agent
// ──────────────────────────────────────────────────────────────────────────

export class MyMCP extends McpAgent<Env, unknown, UserProps> {
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
        const result = await callTasks360(this.env, this.props, "GET", "get-clientes", {
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
        const result = await callTasks360(this.env, this.props, "GET", "get-pessoas", {
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
      "Lista tasks do Tasks 360 com filtros (responsável, cliente, status, prazo). Por padrão retorna só tasks ATIVAS (exclui status 'concluido'). Use pra responder perguntas tipo 'quais tasks P0 abertas do cliente X', 'o que a Jéssica tem pra essa semana', 'quantas tasks vencendo até sexta'. Retorna `{ tasks: [...], total }`; cada task traz cliente/projeto/responsavel já resolvidos por nome, flag `atrasada`, e os campos de conteúdo `area_tecnica`, `valor_esperado`, `solucao_implementada`, `tempo_real_horas` (`escopo` e `valor_entregue` são legado, anteriores a nov/2026) — úteis pra análises de qualidade/entrega. Para resumos agregue no lado do consumidor (a API não agrupa).",
      getTasksSchema,
      async ({ pessoa, status, include_concluido, prazo_de, prazo_ate, cliente_id, cliente, projeto_id, limit }) => {
        const result = await callTasks360(this.env, this.props, "GET", "get-tasks", {
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
        const result = await callTasks360(this.env, this.props, "GET", "get-task-comments", {
          task_id,
          limit: limit !== undefined ? String(limit) : undefined,
        });
        if (!result.ok) return toolError(`get-task-comments falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── update_task ─────────────────────────────────────────────────
    this.server.tool(
      "update_task",
      "Atualiza uma task existente pelo id (qualquer task, não só as com external_id): subetapa/status, valor entregue, solução implementada e horas realizadas. Envie só os campos que mudam. Fica registrado no histórico da task com origem 'mcp'. Em task vinda do Salesforce (VB, CTF, Bodytech) a mudança é enviada para a org do cliente, igual a uma edição feita no app. Retorna a task atualizada e `campos` alterados (`action: 'unchanged'` se nada mudou).",
      updateTaskSchema,
      async (args) => {
        const result = await callTasks360(this.env, this.props, "POST", "update-task", undefined, args);
        if (!result.ok) return toolError(`update-task falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── add_task_comment ────────────────────────────────────────────
    this.server.tool(
      "add_task_comment",
      "Posta um comentário numa task pelo id. Padrão interno (visivel_cliente=false): não aparece no portal nem vai para o Salesforce. Com visivel_cliente=true, o cliente vê no portal e é avisado. O autor é a pessoa logada no MCP (ou 'Time de desenvolvimento'); o responsável da task é avisado no sino. Retorna `{ id, task_id, author, body, posted_em, visivel_cliente }`.",
      addTaskCommentSchema,
      async ({ task_id, texto, visivel_cliente }) => {
        const result = await callTasks360(this.env, this.props, "POST", "add-task-comment", undefined, {
          task_id,
          texto,
          visivel_cliente: visivel_cliente ?? false,
        });
        if (!result.ok) return toolError(`add-task-comment falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── ingest_task ─────────────────────────────────────────────────
    this.server.tool(
      "ingest_task",
      "Cria (ou atualiza, se external_id já existe) uma task no Tasks 360. SEMPRE use external_id deterministico para evitar duplicatas em re-execuções. Cliente, projeto e responsável são casados por nome (case-insensitive) — use os valores exatos retornados por get_clientes/get_pessoas.",
      ingestTaskSchema,
      async (args) => {
        // Task criada pelo MCP conta como criada por IA, salvo se vier explícito
        const body = { ...args, criado_por_ia: args.criado_por_ia ?? true };
        const result = await callTasks360(this.env, this.props, "POST", "ingest-task", undefined, body);
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
        const result = await callTasks360(this.env, this.props, "POST", "post-standup", undefined, body);
        if (!result.ok) return toolError(`post-standup falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── log_horas ───────────────────────────────────────────────────
    this.server.tool(
      "log_horas",
      "Lança horas no Timesheet de uma task, como o lançamento manual do app (data + duração + nota). Por padrão as horas são da pessoa logada no MCP; admin pode lançar para outra pessoa com `pessoa`. Repetir a mesma chamada não duplica (volta `action: 'unchanged'`). Não use para corrigir o total da task: isso é tempo_real_horas em update_task. Retorna `{ id, task_id, titulo, pessoa, data, horas, nota, action }`.",
      logHorasSchema,
      async (args) => {
        if (args.horas === undefined && args.minutos === undefined) return toolError("informe horas ou minutos");
        const result = await callTasks360(this.env, this.props, "POST", "log-time-entry", undefined, args);
        if (!result.ok) return toolError(`log-time-entry falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_horas ───────────────────────────────────────────────────
    this.server.tool(
      "get_horas",
      "Lê os lançamentos do Timesheet num período (padrão: últimos 7 dias), com total, `por_pessoa` e `por_cliente` já somados. Segue o acesso do app: interno vê só as próprias horas, admin vê as de todos, e horas em tarefa privada de outra pessoa saem como 'Privado'. Cada lançamento traz data, pessoa, horas, origem (manual ou cronometro), tarefa, cliente, projeto, prioridade e nota. Use para relatórios de horas, conferir o que foi lançado na semana e cruzar horas com tarefas.",
      getHorasSchema,
      async ({ de, ate, pessoa, cliente, task_id, limit }) => {
        const result = await callTasks360(this.env, this.props, "GET", "get-time-entries", {
          de,
          ate,
          pessoa,
          cliente,
          task_id,
          limit: limit !== undefined ? String(limit) : undefined,
        });
        if (!result.ok) return toolError(`get-time-entries falhou (HTTP ${result.status})`, result.error);
        return toolResult(result.data);
      },
    );

    // ───── get_standups ────────────────────────────────────────────────
    this.server.tool(
      "get_standups",
      "Lê os standups diários publicados, ordenados do mais recente pro mais antigo. Use pra revisar o que foi dito nos últimos dias, ou (passando `data=YYYY-MM-DD`) puxar o standup de um dia específico. Retorna `{ standups: [...], total }` direto do endpoint.",
      getStandupsSchema,
      async ({ limit, data }) => {
        const result = await callTasks360(this.env, this.props, "GET", "get-standups", {
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
// Worker: OAuth provider na frente das rotas MCP
// ──────────────────────────────────────────────────────────────────────────

/** Comparação em tempo constante pro token legado. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export default new OAuthProvider<Env>({
  // Só Streamable HTTP. O transporte SSE (/sse) saiu: nenhum cliente nosso usa e o
  // OAuth exige que toda rota protegida fique sob o resource /mcp.
  apiRoute: "/mcp",
  apiHandler: MyMCP.serve("/mcp"),
  defaultHandler: googleHandler, // /authorize, /callback, /health
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: GRANTED_SCOPES,
  resourceMetadata: {
    resource: MCP_RESOURCE,
    resource_name: "Tasks 360",
  },
  accessTokenTTL: 60 * 60,               // 1h; o cliente renova sozinho com o refresh token
  refreshTokenTTL: 60 * 60 * 24 * 90,    // 90 dias sem uso → precisa logar de novo

  // Token legado (mcp-remote com --header). Some quando o secret MCP_AUTH_TOKEN for apagado.
  resolveExternalToken: async ({ token, env }) => {
    if (!env.MCP_AUTH_TOKEN || !safeEqual(token, env.MCP_AUTH_TOKEN)) return null;
    const props: UserProps = { email: "", name: "token legado", sub: "legacy", via: "legacy-token" };
    return { props, audience: MCP_RESOURCE };
  },
});
