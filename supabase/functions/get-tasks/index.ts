// Edge Function: get-tasks
// Lista tasks pra automações externas (MCP, Cowork etc.) com filtros flexíveis.
//
// Auth: header X-API-Key (mesma lista de INGEST_API_KEYS).
//
// Método: GET (sem body).
//
// Query params (todos opcionais):
//   ?pessoa=<uuid|nome>         filtra por responsável. Aceita UUID exato ou
//                               nome case-insensitive. Omitir = todas as tasks.
//   ?status=backlog,andamento   filtra por status macro — CSV.
//                               Valores: backlog|andamento|bloqueado|concluido.
//                               Default: exclui 'concluido' (tasks ativas).
//   ?include_concluido=true     inclui tasks concluídas (ignora default acima).
//   ?prazo_de=YYYY-MM-DD        prazo >= data.
//   ?prazo_ate=YYYY-MM-DD       prazo <= data.
//   ?cliente_id=<uuid>          filtra por cliente.
//   ?projeto_id=<uuid>          filtra por projeto.
//   ?limit=50                   máx de tasks retornadas (default 100, máx 200).
//
// Resposta 200:
//   {
//     "tasks": [
//       {
//         "id": "...uuid...",
//         "titulo": "Customizar layout",
//         "status": "andamento",
//         "subetapa": "em_desenvolvimento",
//         "prazo": "2026-05-30",         // null se não definido
//         "esforco": 4,                  // null se não definido
//         "prioridade": "P1",            // null se não definida
//         "tipo_trabalho": "feature",    // null se não classificada (bug/feature/discovery/manutencao/admin)
//         "atrasada": false,             // true se prazo < hoje e não concluída
//         "criado_por_ia": false,
//         "criado_em": "2026-05-01T10:00:00Z",
//         "cliente": "Bodytech",         // null se sem cliente
//         "cliente_id": "...uuid...",    // null se sem cliente
//         "projeto": "Sustentação BT",   // null se sem projeto
//         "projeto_id": "...uuid...",    // null se sem projeto
//         "responsavel": "Jéssica",      // null se sem responsável
//         "pessoa_id": "...uuid..."      // null se sem responsável
//       }
//     ],
//     "total": 12
//   }
//
// Use cases típicos (Cowork/MCP):
//   GET /get-tasks?pessoa=jessica@kliente360.com   → semana da pessoa
//   GET /get-tasks?pessoa=<uuid>&prazo_ate=2026-05-25  → urgências do período
//   GET /get-tasks?include_concluido=true&pessoa=<uuid>  → histórico completo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const STATUS_VALID  = ['backlog', 'andamento', 'bloqueado', 'concluido'];
const UUID_RE       = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE       = /^\d{4}-\d{2}-\d{2}$/;
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

// Hoje em YYYY-MM-DD (UTC).
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return err(405, 'method_not_allowed', 'GET only');

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) {
    return err(401, 'unauthorized', 'invalid or missing X-API-Key');
  }

  const url = new URL(req.url);
  const p   = url.searchParams;

  // --- ?pessoa ---
  const pessoaParam     = p.get('pessoa');
  let   pessoaIdFilter: string | null = null;

  if (pessoaParam) {
    if (UUID_RE.test(pessoaParam)) {
      pessoaIdFilter = pessoaParam;
    } else {
      // Aceita nome ou e-mail (ilike no campo nome; fallback no email).
      const { data, error: pErr } = await sb
        .from('pessoas')
        .select('id')
        .or(`nome.ilike.${pessoaParam.trim()},email.ilike.${pessoaParam.trim()}`)
        .limit(1)
        .maybeSingle();
      if (pErr) return err(500, 'db_error', pErr.message);
      if (!data) return err(422, 'pessoa_not_found', `pessoa '${pessoaParam}' não encontrada`);
      pessoaIdFilter = (data as { id: string }).id;
    }
  }

  // --- ?status (CSV) ---
  const statusParam     = p.get('status');
  const includeConc     = p.get('include_concluido') === 'true';
  let   statusFilter: string[] | null = null;

  if (statusParam) {
    statusFilter = statusParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const s of statusFilter) {
      if (!STATUS_VALID.includes(s)) {
        return err(422, 'invalid_status', `status deve ser uma de: ${STATUS_VALID.join('|')}`);
      }
    }
  }

  // --- ?prazo_de / prazo_ate ---
  const prazoDeParam  = p.get('prazo_de');
  const prazoAteParam = p.get('prazo_ate');
  if (prazoDeParam  && !DATE_RE.test(prazoDeParam))  return err(422, 'invalid_prazo_de',  'prazo_de deve ser YYYY-MM-DD');
  if (prazoAteParam && !DATE_RE.test(prazoAteParam)) return err(422, 'invalid_prazo_ate', 'prazo_ate deve ser YYYY-MM-DD');

  // --- ?cliente_id / projeto_id ---
  const clienteIdParam = p.get('cliente_id');
  const projetoIdParam = p.get('projeto_id');
  if (clienteIdParam && !UUID_RE.test(clienteIdParam)) return err(422, 'invalid_cliente_id', 'cliente_id deve ser UUID');
  if (projetoIdParam && !UUID_RE.test(projetoIdParam)) return err(422, 'invalid_projeto_id', 'projeto_id deve ser UUID');

  // --- ?limit ---
  const limitRaw = p.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw != null) {
    const n = parseInt(limitRaw, 10);
    if (Number.isNaN(n) || n < 1) return err(422, 'invalid_limit', 'limit deve ser inteiro positivo');
    limit = Math.min(n, MAX_LIMIT);
  }

  // --- Filtros de "ruído" pra consumidores tipo standup automation ---
  const excludePrivadas = p.get('exclude_privadas') === 'true';
  const excludeInternos = p.get('exclude_internos') === 'true';

  // --- Query principal ---
  // Join via chave estrangeira: clientes, projetos, pessoas.
  let q = sb.from('tasks').select(
    `id, titulo, status, subetapa, prazo, esforco, prioridade, tipo_trabalho, criado_por_ia, criado_em, privada,
     pessoa_id, cliente_id, projeto_id,
     clientes ( nome, eh_interno ),
     projetos ( nome ),
     pessoas:pessoa_id ( nome )`,
  ).is('arquivado_em', null);

  if (excludePrivadas) q = q.eq('privada', false);

  // Filtro por status.
  // Se ?status explícito → usa exatamente esses.
  // Se ?include_concluido=true e sem ?status → tudo.
  // Default: exclui 'concluido'.
  if (statusFilter) {
    q = q.in('status', statusFilter);
  } else if (!includeConc) {
    q = q.neq('status', 'concluido');
  }

  if (pessoaIdFilter) q = q.eq('pessoa_id', pessoaIdFilter);
  if (clienteIdParam) q = q.eq('cliente_id', clienteIdParam);
  if (projetoIdParam) q = q.eq('projeto_id', projetoIdParam);
  if (prazoDeParam)   q = q.gte('prazo', prazoDeParam);
  if (prazoAteParam)  q = q.lte('prazo', prazoAteParam);

  // Ordem: P0 primeiro, depois prazo asc (nulls last), depois mais antiga.
  q = q
    .order('prioridade', { ascending: true, nullsFirst: false })
    .order('prazo', { ascending: true, nullsFirst: false })
    .order('criado_em', { ascending: true })
    .limit(limit);

  const { data: tasks, error: tErr } = await q;
  if (tErr) return err(500, 'db_error', tErr.message);

  const today = todayIso();

  type Raw = {
    id: string; titulo: string; status: string; subetapa: string | null;
    prazo: string | null; esforco: number | null; prioridade: string | null;
    tipo_trabalho: string | null; criado_por_ia: boolean; criado_em: string;
    privada: boolean;
    pessoa_id: string | null; cliente_id: string | null; projeto_id: string | null;
    clientes: { nome: string; eh_interno: boolean } | null;
    projetos: { nome: string } | null;
    pessoas:  { nome: string } | null;
  };

  // Filtro server-side por eh_interno (PostgREST não suporta where em
  // tabela joined de forma trivial · filtramos client-side aqui).
  const filtered = (tasks as Raw[]).filter(t => {
    if (excludeInternos && t.clientes?.eh_interno === true) return false;
    return true;
  });

  const out = filtered.map(t => ({
    id:           t.id,
    titulo:       t.titulo,
    status:       t.status,
    subetapa:     t.subetapa,
    prazo:        t.prazo,
    esforco:      t.esforco,
    prioridade:   t.prioridade,
    tipo_trabalho: t.tipo_trabalho,
    privada:      t.privada === true,
    atrasada:     !!(t.prazo && t.status !== 'concluido' && t.prazo < today),
    criado_por_ia: t.criado_por_ia,
    criado_em:    t.criado_em,
    cliente:      t.clientes?.nome ?? null,
    cliente_id:   t.cliente_id,
    projeto:      t.projetos?.nome ?? null,
    projeto_id:   t.projeto_id,
    responsavel:  t.pessoas?.nome ?? null,
    pessoa_id:    t.pessoa_id,
  }));

  return json(200, { tasks: out, total: out.length });
});
