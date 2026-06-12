// Edge Function: get-clientes
// Lista clientes ativos pra automações externas (Cowork etc) descobrirem
// o vocabulário disponível antes de criar tasks via ingest-task.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS — reusa o token
// da automação).
//
// Método: GET (sem body).
//
// Query params (opcionais):
//   ?include_archived=true   inclui clientes arquivados
//   ?include_interno=true    inclui buckets internos (ex: "Kliente 360")
//   ?with_projetos=true      anexa lista de projetos ativos por cliente
//
// Resposta 200:
//   {
//     "clientes": [
//       {
//         "id": "...uuid...",
//         "nome": "Bodytech",
//         "tier": "estrategico",          // estrategico|potencial|descoberta|null
//         "eh_interno": false,
//         "dominios": ["bodytech.com.br"], // SEMPRE presente; [] se vazio.
//         "webhook_enabled": false,        // true = bloqueia ingest IA (anti-dup
//                                           // com fluxo SF bidi). Hoje VB/CTF.
//         "projetos": [                     // só se ?with_projetos=true
//           { "id":"...", "nome":"Sustentação BT", "tipo":"sustentacao" }
//         ]
//       },
//       ...
//     ]
//   }
//
// Use `dominios` pra identificar cliente quando o nome é acrônimo (CTF, VB
// etc.) e não aparece no domínio dos participantes da reunião. Match
// case-insensitive contra o domínio do email após o @.
//
// Use case típico (automação Cowork):
//   1. Chama GET /get-clientes?with_projetos=true no início do fluxo
//   2. Faz match fuzzy do nome do cliente extraído da conversa contra
//      a lista retornada (escolhe o melhor match ou pede confirmação)
//   3. Usa { cliente: "<nome exato>", projeto: "<nome exato>", criado_por_ia: true }
//      no POST /ingest-task — match por nome continua case-insensitive lá.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS      = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

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
  const includeArchived = url.searchParams.get('include_archived') === 'true';
  const includeInterno  = url.searchParams.get('include_interno')  === 'true';
  const withProjetos    = url.searchParams.get('with_projetos')    === 'true';

  let q = sb.from('clientes').select('id, nome, tier, eh_interno, arquivado_em, dominios, webhook_enabled').order('nome');
  if (!includeArchived) q = q.is('arquivado_em', null);
  if (!includeInterno)  q = q.eq('eh_interno', false);
  const { data: clientes, error: cErr } = await q;
  if (cErr) return err(500, 'db_error', cErr.message);

  type Cliente = { id: string; nome: string; tier: string | null; eh_interno: boolean; arquivado_em: string | null; dominios: string[] | null; webhook_enabled: boolean };
  type ClienteOut = { id: string; nome: string; tier: string | null; eh_interno: boolean; dominios: string[]; webhook_enabled: boolean; projetos?: { id: string; nome: string; tipo: string | null }[] };

  // `dominios` sempre como array — mesmo que DB retorne null (defesa contra
  // rows pré-migration ou se algum dia o NOT NULL for relaxado).
  // `webhook_enabled`: AppScript/Cowork usa pra pular clientes com integração
  // SF bidirecional (VB/CTF) — ingest IA pra eles cai em 409 anti-duplicação.
  const out: ClienteOut[] = (clientes as Cliente[]).map(c => ({
    id: c.id, nome: c.nome, tier: c.tier, eh_interno: c.eh_interno,
    dominios: Array.isArray(c.dominios) ? c.dominios : [],
    webhook_enabled: c.webhook_enabled === true,
  }));

  if (withProjetos && out.length) {
    const ids = out.map(c => c.id);
    let pq = sb.from('projetos').select('id, nome, cliente_id, tipo, arquivado_em').in('cliente_id', ids).order('nome');
    if (!includeArchived) pq = pq.is('arquivado_em', null);
    const { data: projetos, error: pErr } = await pq;
    if (pErr) return err(500, 'db_error', pErr.message);
    const byCliente = new Map<string, { id: string; nome: string; tipo: string | null }[]>();
    for (const p of (projetos as { id: string; nome: string; cliente_id: string; tipo: string | null }[])) {
      let arr = byCliente.get(p.cliente_id);
      if (!arr) { arr = []; byCliente.set(p.cliente_id, arr); }
      arr.push({ id: p.id, nome: p.nome, tipo: p.tipo });
    }
    for (const c of out) c.projetos = byCliente.get(c.id) || [];
  }

  return json(200, { clientes: out });
});
