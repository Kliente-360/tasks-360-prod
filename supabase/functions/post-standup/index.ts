// Edge Function: post-standup
// Publica/atualiza o standup diário (upsert por `data`).
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
// Método: POST.
//
// Body JSON:
//   {
//     "data":            "2026-06-25",        // OBRIG · YYYY-MM-DD
//     "conteudo_md":     "## Standup …",      // OBRIG · markdown principal
//     "texto_whatsapp":  "🚀 Standup …",      // OPC · versão pra colar no grupo
//     "resumo":          "TL;DR curto"        // OPC · 1-2 frases
//   }
//
// Idempotência: ON CONFLICT (data) DO UPDATE.
//   - Atualiza conteudo_md / texto_whatsapp / resumo conforme enviado.
//   - Campos não enviados NÃO são apagados (preserva valor anterior).
//   - atualizado_em vai pra now() automaticamente (trigger).
//
// Resposta 200/201:
//   { "id": "<uuid>", "data": "2026-06-25", "atualizado_em": "2026-06-25T…Z", "action": "created" | "updated" }
//
// Erros 4xx → { "error": { "code", "message" } }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  try { body = await req.json(); } catch { return err(400, 'invalid_json', 'body não é JSON válido'); }

  // --- Validações ---
  const data = body.data;
  if (typeof data !== 'string' || !DATE_RE.test(data)) {
    return err(422, 'invalid_data', 'data deve ser YYYY-MM-DD');
  }

  const conteudoMd = body.conteudo_md;
  if (typeof conteudoMd !== 'string' || !conteudoMd.trim()) {
    return err(422, 'invalid_conteudo_md', 'conteudo_md é obrigatório (string não-vazia)');
  }

  // Opcionais — coerce pra string ou null
  const textoWhatsapp = (typeof body.texto_whatsapp === 'string' && body.texto_whatsapp.trim())
    ? body.texto_whatsapp
    : null;
  const resumo = (typeof body.resumo === 'string' && body.resumo.trim())
    ? body.resumo
    : null;

  // --- Detecta create vs update pra retornar action ---
  const { data: existing, error: lookupErr } = await sb
    .from('standups')
    .select('id')
    .eq('data', data)
    .maybeSingle();
  if (lookupErr) return err(500, 'db_error', lookupErr.message);

  // --- UPSERT por data ---
  // Pra preservar texto_whatsapp/resumo anteriores quando o caller não envia
  // os campos, montamos o payload condicionalmente. conteudo_md é sempre
  // sobrescrito (é o campo principal).
  const payload: Record<string, unknown> = {
    data,
    conteudo_md: conteudoMd,
  };
  if (body.texto_whatsapp !== undefined) payload.texto_whatsapp = textoWhatsapp;
  if (body.resumo !== undefined)         payload.resumo         = resumo;

  const { data: row, error: upErr } = await sb
    .from('standups')
    .upsert(payload, { onConflict: 'data' })
    .select('id, data, atualizado_em')
    .single();

  if (upErr) return err(500, 'db_error', upErr.message);

  return json(existing ? 200 : 201, {
    id:            row.id,
    data:          row.data,
    atualizado_em: row.atualizado_em,
    action:        existing ? 'updated' : 'created',
  });
});
