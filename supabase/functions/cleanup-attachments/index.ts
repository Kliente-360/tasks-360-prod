// Edge Function: cleanup-attachments
// Apaga anexos (rows + storage objects) de tasks concluídas há mais de N dias.
//
// Auth: header X-API-Key (mesmo INGEST_API_KEYS).
// Body JSON (opcional):
//   { "older_than_days": 30 }      -- default 30
//
// Retornos:
//   200 { deleted_rows, deleted_objects, errors }
//   4xx { error: { code, message } }
//
// Idempotente: chamar 2x não dá erro, simplesmente não acha nada a apagar.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const BUCKET       = 'task-attachments';

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

  let body: Record<string, unknown> = {};
  try { body = req.headers.get('content-length') === '0' ? {} : await req.json(); }
  catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const olderThanDays = Number(body.older_than_days ?? 30);
  if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
    return err(422, 'invalid_older_than_days', 'older_than_days must be a positive number');
  }

  // Tasks concluídas há mais de N dias.
  const cutoff = new Date(Date.now() - olderThanDays * 86400 * 1000).toISOString();
  const { data: tasks, error: tErr } = await sb
    .from('tasks')
    .select('id')
    .eq('status', 'concluido')
    .lt('status_em', cutoff);
  if (tErr) return err(500, 'db_error', tErr.message);
  if (!tasks || tasks.length === 0) {
    return json(200, { deleted_rows: 0, deleted_objects: 0, errors: [] });
  }

  const taskIds = tasks.map(t => t.id);

  // Anexos dessas tasks.
  const { data: atts, error: aErr } = await sb
    .from('task_attachments')
    .select('id, storage_path')
    .in('task_id', taskIds);
  if (aErr) return err(500, 'db_error', aErr.message);
  if (!atts || atts.length === 0) {
    return json(200, { deleted_rows: 0, deleted_objects: 0, errors: [] });
  }

  const paths = atts.map(a => a.storage_path);
  const ids   = atts.map(a => a.id);
  const errors: string[] = [];

  // Storage primeiro (chunked 100). Se falhar, NÃO deleta row pra evitar órfão sem rastro.
  let deletedObjects = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { data: removed, error: rmErr } = await sb.storage.from(BUCKET).remove(chunk);
    if (rmErr) { errors.push('storage: ' + rmErr.message); continue; }
    deletedObjects += (removed || []).length;
  }

  // Rows.
  const { error: delErr, count } = await sb
    .from('task_attachments')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (delErr) errors.push('db: ' + delErr.message);

  return json(200, {
    deleted_rows: count ?? 0,
    deleted_objects: deletedObjects,
    errors,
  });
});
