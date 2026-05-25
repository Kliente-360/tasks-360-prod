// Edge Function: delete-task
// Deleta uma task que tenha sido sincronizada de um sistema externo
// (typicamente Salesforce). Cascade vai derrubar comments e history.
//
// Auth: header X-API-Key (mesmo INGEST_API_KEYS do ingest-task).
//
// Body JSON:
//   { "external_id": "a0X5g000000XYZ" }
//
// Retornos:
//   200 { id, action: "deleted" }      — apagou
//   200 { action: "noop" }             — não existia (idempotente)
//   4xx { error: { code, message } }
//
// Idempotente: chamar 2x não dá erro.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const SOURCE       = 'salesforce';

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
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) {
    return err(401, 'unauthorized', 'invalid or missing X-API-Key');
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const externalId = String(body.external_id ?? '').trim();
  if (!externalId) return err(422, 'missing_external_id', 'external_id is required');

  const { data: existing, error: lookupErr } = await sb
    .from('tasks')
    .select('id')
    .eq('external_source', SOURCE)
    .eq('external_id', externalId)
    .maybeSingle();
  if (lookupErr) return err(500, 'db_error', lookupErr.message);

  if (!existing) return json(200, { action: 'noop' });

  const { error: delErr } = await sb.from('tasks').delete().eq('id', existing.id);
  if (delErr) return err(500, 'db_error', delErr.message);

  return json(200, { id: existing.id, action: 'deleted' });
});
