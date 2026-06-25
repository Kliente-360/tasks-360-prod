// Edge Function: get-standups
// Lê os standups diários publicados, mais recente primeiro.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
// Método: GET.
//
// Query params:
//   ?data=YYYY-MM-DD      OPC · filtra por data exata (retorna 0 ou 1 row)
//   ?limit=30             OPC · default 30, máx 90
//
// Resposta 200:
//   {
//     "standups": [
//       {
//         "id":             "<uuid>",
//         "data":           "2026-06-25",
//         "conteudo_md":    "## Standup …",
//         "texto_whatsapp": "🚀 …" | null,
//         "resumo":         "TL;DR" | null,
//         "atualizado_em":  "2026-06-25T…Z"
//       }
//     ],
//     "total": N
//   }
//
// Ordem: data DESC (mais recente primeiro).
// Erros 4xx → { "error": { "code", "message" } }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LIMIT     = 90;
const DEFAULT_LIMIT = 30;

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

  // --- ?data (opc) ---
  const dataParam = p.get('data');
  if (dataParam !== null && !DATE_RE.test(dataParam)) {
    return err(422, 'invalid_data', 'data deve ser YYYY-MM-DD');
  }

  // --- ?limit ---
  const limitRaw = p.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const n = parseInt(limitRaw, 10);
    if (Number.isNaN(n) || n < 1) return err(422, 'invalid_limit', 'limit deve ser inteiro positivo');
    limit = Math.min(n, MAX_LIMIT);
  }

  // --- Query ---
  let q = sb
    .from('standups')
    .select('id, data, conteudo_md, texto_whatsapp, resumo, atualizado_em')
    .order('data', { ascending: false })
    .limit(limit);

  if (dataParam) q = q.eq('data', dataParam);

  const { data: rows, error: qErr } = await q;
  if (qErr) return err(500, 'db_error', qErr.message);

  return json(200, { standups: rows ?? [], total: rows?.length ?? 0 });
});
