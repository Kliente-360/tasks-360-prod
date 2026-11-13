// Edge Function: get-activity
// O que mudou desde uma data · usada pela tool MCP `get_atividade`
// (standup, resumo semanal, "o que aconteceu ontem").
//
// Auth: header x-api-key (INGEST_API_KEYS). Header x-tasks360-user aplica o
// acesso do app: tarefa privada (dela, do projeto ou do cliente) só aparece
// para o CEO e o responsável. Horas seguem o Timesheet: interno vê só as
// próprias, admin vê as de todos.
//
// Query: desde (YYYY-MM-DD ou ISO; padrão: 24h atrás), ate (padrão: agora),
//        cliente (nome), pessoa (nome ou uuid · responsável da tarefa),
//        limit (por lista; padrão 100, máx. 500)
// Retorna { desde, ate, resumo, etapas, criadas, comentarios, outras_mudancas, horas }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { acessoDe, podeVerTarefa } from '../_shared/acesso.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const h2 = (ms: number) => Math.round((ms / 3_600_000) * 100) / 100;

/** YYYY-MM-DD vira meia-noite de São Paulo; ISO completo passa direto. */
function instante(v: string | null, padrao: Date): Date | null {
  if (!v) return padrao;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00-03:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') return err(405, 'method_not_allowed', 'GET only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  const p = new URL(req.url).searchParams;
  const agora = new Date();
  const desde = instante(p.get('desde'), new Date(agora.getTime() - 86_400_000));
  const ateRaw = p.get('ate');
  // ate=YYYY-MM-DD inclui o dia inteiro
  const ate = ateRaw && /^\d{4}-\d{2}-\d{2}$/.test(ateRaw)
    ? new Date(new Date(`${ateRaw}T00:00:00-03:00`).getTime() + 86_400_000 - 1)
    : instante(ateRaw, agora);
  if (!desde || !ate) return err(422, 'invalid_data', 'desde e ate em YYYY-MM-DD ou ISO');
  if (desde > ate) return err(422, 'invalid_periodo', 'desde depois de ate');
  const limit = Math.min(Math.max(Number(p.get('limit')) || 100, 1), 500);
  const dIso = desde.toISOString();
  const aIso = ate.toISOString();

  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  const { data: pessoaChamador } = email
    ? await sb.from('pessoas').select('id, nome, role, is_ceo').ilike('email', email).maybeSingle()
    : { data: null };
  const acesso = acessoDe(email, pessoaChamador);
  if (acesso.tipo === 'desconhecido') return err(403, 'forbidden', 'e-mail sem cadastro no Tasks 360');

  // Filtros opcionais
  let clienteId: string | null = null;
  const clienteNome = (p.get('cliente') || '').trim();
  if (clienteNome) {
    const { data: cs } = await sb.from('clientes').select('id').ilike('nome', clienteNome).limit(1);
    if (!cs?.length) return err(422, 'cliente_not_found', `cliente '${clienteNome}' não encontrado`);
    clienteId = cs[0].id;
  }
  let pessoaId: string | null = null;
  const pessoaParam = (p.get('pessoa') || '').trim();
  if (pessoaParam) {
    let q = sb.from('pessoas').select('id').in('role', ['admin', 'interno']);
    q = UUID_RE.test(pessoaParam) ? q.eq('id', pessoaParam) : q.ilike('nome', `${pessoaParam}%`);
    const { data: ps } = await q.limit(2);
    if (!ps?.length) return err(404, 'pessoa_not_found', `ninguém do time encontrado para "${pessoaParam}"`);
    if (ps.length > 1) return err(422, 'pessoa_ambigua', `"${pessoaParam}" bate com mais de uma pessoa; use o uuid`);
    pessoaId = ps[0].id;
  }

  const [{ data: hist }, { data: criadas }, { data: coments }, { data: entries }, { data: pessoas }] = await Promise.all([
    sb.from('task_field_history')
      .select('task_id, field, from_value, to_value, actor_pessoa_id, actor_source, occurred_at')
      .in('field', ['subetapa', 'pessoa', 'prazo', 'prioridade'])
      .gte('occurred_at', dIso).lte('occurred_at', aIso)
      .order('occurred_at', { ascending: false }).limit(limit * 3),
    sb.from('tasks').select('id').gte('criado_em', dIso).lte('criado_em', aIso).is('arquivado_em', null).limit(limit),
    sb.from('task_comments')
      .select('task_id, body, posted_em, author, visivel_cliente, from_cliente, pessoas:author_pessoa_id ( nome )')
      .gte('posted_em', dIso).lte('posted_em', aIso)
      .order('posted_em', { ascending: false }).limit(limit),
    sb.from('time_entries').select('task_id, pessoa_id, started_at, ended_at')
      .gte('started_at', dIso).lte('started_at', aIso).limit(2000),
    sb.from('pessoas').select('id, nome'),
  ]);
  const nomeDe = new Map((pessoas ?? []).map((x) => [x.id, x.nome as string]));

  // Contexto e acesso das tarefas envolvidas
  const ids = [...new Set([
    ...(hist ?? []).map((h) => h.task_id),
    ...(criadas ?? []).map((t) => t.id),
    ...(coments ?? []).map((c) => c.task_id),
    ...(entries ?? []).map((e) => e.task_id),
  ])];
  const tasks: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from('tasks')
      .select('id, titulo, status, subetapa, prioridade, prazo, pessoa_id, cliente_id, privada, criado_em, criado_por_cliente, criado_por_ia, clientes ( nome, privado ), projetos ( nome, privado )')
      .in('id', ids.slice(i, i + 300));
    tasks.push(...(data ?? []));
  }
  type T = { id: string; titulo: string; status: string; subetapa: string; prioridade: string | null; prazo: string | null;
    pessoa_id: string | null; cliente_id: string | null; privada: boolean; criado_em: string;
    criado_por_cliente: boolean | null; criado_por_ia: boolean | null;
    clientes: { nome: string; privado: boolean } | null; projetos: { nome: string; privado: boolean } | null };
  const visiveis = new Map<string, T>();
  for (const raw of tasks as unknown as T[]) {
    if (!podeVerTarefa(acesso, { privada: raw.privada, pessoa_id: raw.pessoa_id, cliente_privado: raw.clientes?.privado, projeto_privado: raw.projetos?.privado })) continue;
    if (clienteId && raw.cliente_id !== clienteId) continue;
    if (pessoaId && raw.pessoa_id !== pessoaId) continue;
    visiveis.set(raw.id, raw);
  }
  const ref = (t: T) => ({ task_id: t.id, titulo: t.titulo, cliente: t.clientes?.nome ?? null, responsavel: t.pessoa_id ? nomeDe.get(t.pessoa_id) ?? null : null });
  const nomeOuId = (v: string | null) => (v ? nomeDe.get(v) ?? v : null);

  const etapas: unknown[] = [];
  const outras: unknown[] = [];
  for (const h of hist ?? []) {
    const t = visiveis.get(h.task_id);
    if (!t) continue;
    const item = {
      ...ref(t),
      campo: h.field,
      de: h.field === 'pessoa' ? nomeOuId(h.from_value) : h.from_value,
      para: h.field === 'pessoa' ? nomeOuId(h.to_value) : h.to_value,
      por: h.actor_pessoa_id ? nomeDe.get(h.actor_pessoa_id) ?? null : null,
      origem: h.actor_source,
      quando: h.occurred_at,
    };
    if (h.field === 'subetapa') { if (etapas.length < limit) etapas.push(item); }
    else if (outras.length < limit) outras.push(item);
  }

  const novas = (criadas ?? []).map((c) => visiveis.get(c.id)).filter(Boolean).map((t) => ({
    ...ref(t!), prioridade: t!.prioridade, prazo: t!.prazo, subetapa: t!.subetapa, criada_em: t!.criado_em,
    origem: t!.criado_por_cliente ? 'cliente' : t!.criado_por_ia ? 'ia' : 'time',
  }));

  const comentarios = (coments ?? []).filter((c) => visiveis.has(c.task_id)).map((c: Record<string, unknown>) => ({
    ...ref(visiveis.get(c.task_id as string)!),
    autor: (c.pessoas as { nome: string } | null)?.nome ?? c.author ?? null,
    quando: c.posted_em,
    texto: String(c.body ?? '').slice(0, 500),
    visivel_cliente: c.visivel_cliente === true,
    do_cliente: c.from_cliente === true,
  }));

  // Horas: mesmo acesso do Timesheet (interno só as próprias)
  const veTodasHoras = acesso.tipo === 'sistema' || (acesso.tipo === 'pessoa' && acesso.role === 'admin');
  let horasMs = 0;
  const horasPorPessoa = new Map<string, number>();
  for (const e of entries ?? []) {
    if (!veTodasHoras && acesso.tipo === 'pessoa' && e.pessoa_id !== acesso.id) continue;
    if ((clienteId || pessoaId) && !visiveis.has(e.task_id)) continue;
    const ms = (e.ended_at ? Date.parse(e.ended_at) : Date.now()) - Date.parse(e.started_at);
    horasMs += ms;
    const n = nomeDe.get(e.pessoa_id) ?? '—';
    horasPorPessoa.set(n, (horasPorPessoa.get(n) ?? 0) + ms);
  }

  const concluidas = etapas.filter((e) => (e as { para: string }).para === 'concluido').length;
  const paraHomologacao = etapas.filter((e) => (e as { para: string }).para === 'em_homologacao').length;
  return json(200, {
    desde: dIso,
    ate: aIso,
    resumo: {
      mudancas_de_etapa: etapas.length,
      concluidas,
      enviadas_para_homologacao: paraHomologacao,
      criadas: novas.length,
      comentarios: comentarios.length,
      comentarios_de_cliente: comentarios.filter((c) => c.do_cliente).length,
      horas_lancadas: h2(horasMs),
    },
    etapas,
    criadas: novas,
    comentarios,
    outras_mudancas: outras,
    horas: { total: h2(horasMs), por_pessoa: [...horasPorPessoa.entries()].sort((a, b) => b[1] - a[1]).map(([nome, ms]) => ({ nome, horas: h2(ms) })) },
  });
});
