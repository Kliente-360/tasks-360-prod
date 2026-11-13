// Edge Function: get-time-entries
// Lê lançamentos do Timesheet com totais · usada pela tool MCP `get_horas`.
//
// Auth: header x-api-key (INGEST_API_KEYS). Header x-tasks360-user (e-mail
// de quem chamou pelo MCP) aplica a mesma regra do app:
//   - interno vê só as próprias horas; admin vê as de todos
//   - horas em tarefa privada (da tarefa, do projeto ou do cliente) de outra
//     pessoa saem anônimas (sem título, cliente, projeto e nota), salvo para o CEO
//   - sem e-mail identificado (token legado), vale como admin
//
// Query: de, ate (YYYY-MM-DD, padrão últimos 7 dias), pessoa (nome ou uuid),
//        cliente (nome) ou cliente_id, task_id, limit (padrão 200, máx. 1000)
// Retorna { de, ate, total_horas, registros, por_pessoa, por_cliente, lancamentos }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dataSaoPaulo } from '../_shared/lancamento.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const h2 = (ms: number) => Math.round((ms / 3_600_000) * 100) / 100;

Deno.serve(async (req) => {
  if (req.method !== 'GET') return err(405, 'method_not_allowed', 'GET only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  const p = new URL(req.url).searchParams;
  const hoje = dataSaoPaulo(new Date());
  const ate = p.get('ate') || hoje;
  const de = p.get('de') || dataSaoPaulo(new Date(Date.now() - 6 * 86_400_000));
  if (!DATA_RE.test(de) || !DATA_RE.test(ate)) return err(422, 'invalid_data', 'de e ate no formato YYYY-MM-DD');
  if (de > ate) return err(422, 'invalid_periodo', 'de depois de ate');
  const limit = Math.min(Math.max(Number(p.get('limit')) || 200, 1), 1000);

  // Quem chamou
  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  let chamador: { id: string; role: string; is_ceo: boolean } | null = null;
  if (email) {
    const { data: c } = await sb.from('pessoas').select('id, role, is_ceo').ilike('email', email).maybeSingle();
    if (!c) return err(403, 'forbidden', 'e-mail sem cadastro no Tasks 360');
    chamador = c;
  }
  if (chamador && chamador.role !== 'admin' && chamador.role !== 'interno') return err(403, 'forbidden', 'só gente do time lê horas');
  const veTodos = !chamador || chamador.role === 'admin';
  const veTudoPrivado = !chamador || chamador.is_ceo === true;

  let q = sb
    .from('time_entries')
    .select('id, task_id, pessoa_id, started_at, ended_at, note, manual')
    .gte('started_at', `${de}T00:00:00-03:00`)
    .lte('started_at', `${ate}T23:59:59-03:00`)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (!veTodos) q = q.eq('pessoa_id', chamador!.id);

  const pessoaParam = (p.get('pessoa') || '').trim();
  if (pessoaParam) {
    let pq = sb.from('pessoas').select('id').in('role', ['admin', 'interno']);
    pq = UUID_RE.test(pessoaParam) ? pq.eq('id', pessoaParam) : pq.ilike('nome', `${pessoaParam}%`);
    const { data: ps } = await pq;
    if (!ps?.length) return err(404, 'pessoa_not_found', `ninguém do time encontrado para "${pessoaParam}"`);
    q = q.in('pessoa_id', ps.map((x) => x.id));
  }
  const taskId = (p.get('task_id') || '').trim();
  if (taskId) {
    if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');
    q = q.eq('task_id', taskId);
  }

  const { data: entries, error: eErr } = await q;
  if (eErr) return err(500, 'db_error', eErr.message);
  const rows = entries ?? [];

  // Contexto: tarefas, clientes, projetos e pessoas
  const taskIds = [...new Set(rows.map((r) => r.task_id))];
  const { data: tasks } = taskIds.length
    ? await sb.from('tasks').select('id, titulo, cliente_id, projeto_id, pessoa_id, privada, prioridade').in('id', taskIds)
    : { data: [] };
  const tasksById = new Map((tasks ?? []).map((t) => [t.id, t]));
  const [{ data: clientes }, { data: projetos }, { data: pessoas }] = await Promise.all([
    sb.from('clientes').select('id, nome, privado'),
    sb.from('projetos').select('id, nome, privado'),
    sb.from('pessoas').select('id, nome'),
  ]);
  const cliById = new Map((clientes ?? []).map((c) => [c.id, c]));
  const projById = new Map((projetos ?? []).map((x) => [x.id, x]));
  const pesById = new Map((pessoas ?? []).map((x) => [x.id, x.nome as string]));

  const clienteFiltroId = (p.get('cliente_id') || '').trim();
  const clienteFiltroNome = (p.get('cliente') || '').trim().toLowerCase();

  const lancamentos: Record<string, unknown>[] = [];
  const porPessoa = new Map<string, number>();
  const porCliente = new Map<string, number>();
  let totalMs = 0;
  for (const r of rows) {
    const t = tasksById.get(r.task_id);
    const cli = t?.cliente_id ? cliById.get(t.cliente_id) : undefined;
    const proj = t?.projeto_id ? projById.get(t.projeto_id) : undefined;
    const privada = !!(t?.privada || cli?.privado || proj?.privado);
    const anonima = privada && !veTudoPrivado && r.pessoa_id !== chamador?.id && t?.pessoa_id !== chamador?.id;
    if (clienteFiltroId && (anonima || t?.cliente_id !== clienteFiltroId)) continue;
    if (clienteFiltroNome && (anonima || (cli?.nome ?? '').toLowerCase() !== clienteFiltroNome)) continue;

    const ms = (r.ended_at ? Date.parse(r.ended_at) : Date.now()) - Date.parse(r.started_at);
    totalMs += ms;
    const pessoaNome = pesById.get(r.pessoa_id) ?? '—';
    const clienteNome = anonima ? 'Privado' : cli?.nome ?? '—';
    porPessoa.set(pessoaNome, (porPessoa.get(pessoaNome) ?? 0) + ms);
    porCliente.set(clienteNome, (porCliente.get(clienteNome) ?? 0) + ms);
    lancamentos.push({
      id: r.id,
      data: dataSaoPaulo(new Date(r.started_at)),
      pessoa: pessoaNome,
      horas: h2(ms),
      em_andamento: !r.ended_at,
      origem: r.manual ? 'manual' : 'cronometro',
      task_id: anonima ? null : r.task_id,
      tarefa: anonima ? 'Privado' : t?.titulo ?? null,
      cliente: clienteNome,
      projeto: anonima ? null : proj?.nome ?? null,
      prioridade: t?.prioridade ?? null,
      nota: anonima ? null : r.note,
    });
  }
  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, ms]) => ({ nome, horas: h2(ms) }));

  return json(200, {
    de,
    ate,
    total_horas: h2(totalMs),
    registros: lancamentos.length,
    truncado: rows.length === limit,
    por_pessoa: ordenar(porPessoa),
    por_cliente: ordenar(porCliente),
    lancamentos,
  });
});
