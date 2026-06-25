// Edge Function: get-task-comments
// Lista comentários de uma task específica, do mais recente pro mais antigo.
// Use case típico: resumir histórico/discussão de uma task pra standup ou contexto.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
//
// Método: GET.
//
// Query params:
//   ?task_id=<uuid>   OBRIGATÓRIO. UUID da task.
//   ?limit=50         máx de comentários retornados (default 100, máx 200).
//
// Resposta 200:
//   {
//     "comentarios": [
//       {
//         "id": "...uuid...",
//         "autor": "Jéssica",                // nome resolvido via pessoas.nome.
//                                             // Fallback no campo author (texto livre)
//                                             // se author_pessoa_id estiver vazio
//                                             // (ex: comentário de cliente externo).
//         "data": "2026-05-15T14:22:00Z",    // posted_em (data original) ou criado_em
//         "texto": "Conteúdo do comentário"
//       }
//     ],
//     "total": 5
//   }
//
// Ordem: mais recente primeiro (COALESCE(posted_em, criado_em) DESC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT     = 200;
const DEFAULT_LIMIT = 100;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const err = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

Deno.serve(async (req) => {
  if (req.method !== 'GET') return err(405, 'method_not_allowed', 'GET only');

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) {
    return err(401, 'unauthorized', 'invalid or missing X-API-Key');
  }

  const url = new URL(req.url);
  const p   = url.searchParams;

  // --- ?task_id (obrigatório) ---
  const taskId = p.get('task_id');
  if (!taskId)             return err(422, 'missing_task_id', 'task_id é obrigatório');
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser UUID');

  // --- ?limit ---
  const limitRaw = p.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw != null) {
    const n = parseInt(limitRaw, 10);
    if (Number.isNaN(n) || n < 1) return err(422, 'invalid_limit', 'limit deve ser inteiro positivo');
    limit = Math.min(n, MAX_LIMIT);
  }

  // --- Query principal ---
  // Embed da tabela pessoas (autor interno) — não-ambíguo aqui (uma FK só:
  // task_comments_author_pessoa_id_fkey). Mantém `author` (texto livre) como
  // fallback pra comentários de clientes externos sem pessoa_id resolvida.
  const { data: rows, error: cErr } = await sb
    .from('task_comments')
    .select(
      `id, body, posted_em, criado_em, author, author_pessoa_id,
       pessoas:author_pessoa_id ( nome )`,
    )
    .eq('task_id', taskId)
    // Ordenar por posted_em desc; comentários sem posted_em caem no criado_em
    // via segundo order (nullsFirst:false garante que nulls de posted_em
    // não fiquem no topo).
    .order('posted_em', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false })
    .limit(limit);

  if (cErr) return err(500, 'db_error', cErr.message);

  type Raw = {
    id: string;
    body: string;
    posted_em: string | null;
    criado_em: string;
    author: string | null;
    author_pessoa_id: string | null;
    pessoas: { nome: string } | null;
  };

  const out = (rows as Raw[]).map(c => ({
    id:    c.id,
    autor: c.pessoas?.nome ?? c.author ?? null,
    data:  c.posted_em ?? c.criado_em,
    texto: c.body,
  }));

  return json(200, { comentarios: out, total: out.length });
});