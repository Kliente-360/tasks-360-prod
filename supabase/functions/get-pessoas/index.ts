// Edge Function: get-pessoas
// Lista pessoas (time interno + clientes externos opcionais) pra automações
// descobrirem candidatos a responsável de tasks antes de chamar ingest-task.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
//
// Método: GET (sem body).
//
// Query params (opcionais):
//   ?include_clientes=true     inclui pessoas com role='cliente' (default: exclui)
//   ?role=admin,interno        filtra por role(s) — CSV
//   ?cliente_id=<uuid>         só pessoas alocadas no cliente (cliente_principal_id
//                              OU cliente_secundario_id). Útil pra Cowork sugerir
//                              responsável dentro do time alocado ao cliente da task.
//   ?with_load=true            anexa { tasks_ativas, horas_pendentes } por pessoa
//                              (calcula esforço soma de tasks não-concluídas)
//
// Resposta 200:
//   {
//     "pessoas": [
//       {
//         "id": "...uuid...",
//         "nome": "Jéssica Santos",
//         "email": "jessica@kliente360.com",
//         "role": "interno",                       // admin|interno|cliente
//         "senioridade": "pleno",                  // junior|pleno|senior|null
//         "capacidade_horas_semana": 30,
//         "skills": ["frontend", "react"],
//         "cliente_principal_id": "...uuid...",
//         "cliente_secundario_id": null,
//         "tasks_ativas": 8,                       // só com ?with_load=true
//         "horas_pendentes": 24                    // só com ?with_load=true
//       }
//     ]
//   }
//
// Use case típico (Cowork):
//   1. Resolve cliente_id via /get-clientes
//   2. GET /get-pessoas?cliente_id=<id>&with_load=true
//   3. Escolhe candidato por skill match + menor carga
//   4. POST /ingest-task com { responsavel: "<nome exato>", ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS      = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const ROLE_VALID = ['admin', 'interno', 'cliente'];

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
  const includeClientes = url.searchParams.get('include_clientes') === 'true';
  const rolesParam      = url.searchParams.get('role');
  const clienteId       = url.searchParams.get('cliente_id');
  const withLoad        = url.searchParams.get('with_load') === 'true';
  // Exclui tasks de clientes internos (eh_interno=true) e/ou privadas do
  // cálculo de carga · usado por standup automation pra não inflar números
  // com Kliente 360 / privadas do CEO.
  const excludeInternos = url.searchParams.get('exclude_internos') === 'true';
  const excludePrivadas = url.searchParams.get('exclude_privadas') === 'true';

  // Validação de roles param
  let rolesFilter: string[] | null = null;
  if (rolesParam) {
    rolesFilter = rolesParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const r of rolesFilter) {
      if (!ROLE_VALID.includes(r)) {
        return err(422, 'invalid_role', `role deve ser uma de: ${ROLE_VALID.join('|')}`);
      }
    }
  }

  let q = sb.from('pessoas')
    .select('id, nome, email, role, senioridade, capacidade_horas_semana, skills, cliente_principal_id, cliente_secundario_id')
    .order('nome');

  // Default: exclui role='cliente' (não são candidatos a responsável).
  // Override via ?include_clientes=true ou ?role=cliente (explícito).
  if (rolesFilter) {
    q = q.in('role', rolesFilter);
  } else if (!includeClientes) {
    q = q.neq('role', 'cliente');
  }

  // Filtro por cliente: pessoa alocada como principal OU secundário daquele cliente.
  if (clienteId) {
    q = q.or(`cliente_principal_id.eq.${clienteId},cliente_secundario_id.eq.${clienteId}`);
  }

  const { data: pessoas, error: pErr } = await q;
  if (pErr) return err(500, 'db_error', pErr.message);

  type Pessoa = {
    id: string; nome: string; email: string | null; role: string | null;
    senioridade: string | null; capacidade_horas_semana: number | null;
    skills: string[] | null;
    cliente_principal_id: string | null; cliente_secundario_id: string | null;
  };
  type PessoaOut = Pessoa & { tasks_ativas?: number; horas_pendentes?: number };

  const out: PessoaOut[] = (pessoas as Pessoa[]).map(p => ({
    ...p,
    skills: p.skills || [],
  }));

  // Anexa carga atual (tasks ativas + soma de esforço pendente).
  // Esforço efetivo: usa `esforco` declarado; se 0/null, conta como 4h
  // (mesma heurística do app — effEsforco em lib/helpers.js).
  if (withLoad && out.length) {
    const ids = out.map(p => p.id);
    let tq = sb
      .from('tasks')
      .select('pessoa_id, esforco, tempo_real_horas, privada, clientes(eh_interno)')
      .in('pessoa_id', ids)
      .neq('status', 'concluido')
      .is('arquivado_em', null);
    if (excludePrivadas) tq = tq.eq('privada', false);
    const { data: tasks, error: tErr } = await tq;
    if (tErr) return err(500, 'db_error', tErr.message);
    type TaskLoad = {
      pessoa_id: string;
      esforco: number | null;
      tempo_real_horas: number | null;
      privada: boolean | null;
      clientes: { eh_interno: boolean } | null;
    };
    const filtered = (tasks as TaskLoad[]).filter(t => {
      if (excludeInternos && t.clientes?.eh_interno === true) return false;
      return true;
    });
    const loadByPessoa = new Map<string, { count: number; horas: number }>();
    for (const t of filtered) {
      const cur = loadByPessoa.get(t.pessoa_id) || { count: 0, horas: 0 };
      cur.count += 1;
      const eff = Number(t.esforco) > 0 ? Number(t.esforco) : 4;
      cur.horas += Math.max(0, eff - (Number(t.tempo_real_horas) || 0));
      loadByPessoa.set(t.pessoa_id, cur);
    }
    for (const p of out) {
      const load = loadByPessoa.get(p.id);
      p.tasks_ativas    = load ? load.count : 0;
      p.horas_pendentes = load ? load.horas : 0;
    }
  }

  return json(200, { pessoas: out });
});
