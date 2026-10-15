// Edge Function: post-portal-insight
// Publica/atualiza o texto de uma caixa de IA do portal do cliente
// (upsert por cliente_id + tipo + periodo). Publicação direta: o portal
// mostra o mais recente de cada tipo.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
// Método: POST.
//
// Body JSON:
//   {
//     "cliente_id":  "<uuid>",          // OBRIG · cliente externo
//     "tipo":        "entregas",        // OBRIG · 'entregas' | 'riscos'
//     "periodo":     "2026-09",         // OBRIG · entregas: YYYY-MM · riscos: YYYY-MM-DD
//     "conteudo_md": "Em setembro…"     // OBRIG · markdown
//   }
//
// Resposta 200/201: { "id", "cliente_id", "tipo", "periodo", "action": "created" | "updated" }
// Erros 4xx → { "error": { "code", "message" } }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_RE   = /^\d{4}-\d{2}$/;
const DIA_RE   = /^\d{4}-\d{2}-\d{2}$/;

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

  const clienteId = body.cliente_id;
  if (typeof clienteId !== 'string' || !UUID_RE.test(clienteId)) {
    return err(422, 'invalid_cliente_id', 'cliente_id deve ser uuid');
  }
  const tipo = body.tipo;
  if (tipo !== 'entregas' && tipo !== 'riscos') {
    return err(422, 'invalid_tipo', "tipo deve ser 'entregas' ou 'riscos'");
  }
  const periodo = body.periodo;
  if (typeof periodo !== 'string' || !(tipo === 'entregas' ? MES_RE : DIA_RE).test(periodo)) {
    return err(422, 'invalid_periodo', tipo === 'entregas' ? 'periodo deve ser YYYY-MM' : 'periodo deve ser YYYY-MM-DD');
  }
  const conteudoMd = body.conteudo_md;
  if (typeof conteudoMd !== 'string' || !conteudoMd.trim()) {
    return err(422, 'invalid_conteudo_md', 'conteudo_md é obrigatório (string não-vazia)');
  }

  // Só cliente externo ativo
  const { data: cliente, error: cErr } = await sb
    .from('clientes')
    .select('id, eh_interno, arquivado_em')
    .eq('id', clienteId)
    .maybeSingle();
  if (cErr) return err(500, 'db_error', cErr.message);
  if (!cliente || cliente.eh_interno || cliente.arquivado_em) {
    return err(422, 'invalid_cliente', 'cliente não existe, é interno ou está arquivado');
  }

  const { data: existing, error: lookupErr } = await sb
    .from('portal_insights')
    .select('id')
    .eq('cliente_id', clienteId)
    .eq('tipo', tipo)
    .eq('periodo', periodo)
    .maybeSingle();
  if (lookupErr) return err(500, 'db_error', lookupErr.message);

  const { data: row, error: upErr } = await sb
    .from('portal_insights')
    .upsert(
      { cliente_id: clienteId, tipo, periodo, conteudo_md: conteudoMd, gerado_em: new Date().toISOString() },
      { onConflict: 'cliente_id,tipo,periodo' },
    )
    .select('id, cliente_id, tipo, periodo')
    .single();
  if (upErr) return err(500, 'db_error', upErr.message);

  return json(existing ? 200 : 201, { ...row, action: existing ? 'updated' : 'created' });
});
