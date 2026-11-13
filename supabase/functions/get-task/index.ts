// Edge Function: get-task
// Uma tarefa completa numa chamada · usada pela tool MCP `get_task`:
// campos (inclui solicitação, critério de aceite e checklist), dependências,
// horas lançadas (total e por pessoa), histórico de etapas e últimos
// comentários.
//
// Auth: header x-api-key (INGEST_API_KEYS). Header x-tasks360-user aplica o
// acesso do app (_shared/acesso.ts): tarefa privada só para o CEO e o
// responsável; para os outros ela "não existe" (404).
//
// Query: task_id (uuid, obrigatório), comentarios (padrão 20, máx. 100)

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

Deno.serve(async (req) => {
  if (req.method !== 'GET') return err(405, 'method_not_allowed', 'GET only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  const p = new URL(req.url).searchParams;
  const taskId = (p.get('task_id') || '').trim();
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');
  const nComent = Math.min(Math.max(Number(p.get('comentarios')) || 20, 0), 100);

  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  const { data: pessoaChamador } = email
    ? await sb.from('pessoas').select('id, nome, role, is_ceo').ilike('email', email).maybeSingle()
    : { data: null };
  const acesso = acessoDe(email, pessoaChamador);

  const { data: task, error: tErr } = await sb
    .from('tasks')
    .select(`id, titulo, status, subetapa, prioridade, prazo, esforco, esforco_inicial, tipo_trabalho, area_tecnica,
      descricao, criterio_aceite, valor_esperado, solucao_implementada, valor_entregue, checklist,
      bloqueado_por, bloqueada_por_tasks, motivo_reabertura, reopen_count, visivel_cliente, privada, radar,
      criado_por_ia, criado_por_cliente, criado_em, status_em, subetapa_em, homologacao_em, aprovado_em, arquivado_em,
      external_source, external_id, pessoa_id, cliente_id, projeto_id,
      clientes ( nome, privado ), projetos ( nome, privado ), pessoas:pessoa_id ( nome )`)
    .eq('id', taskId)
    .maybeSingle();
  if (tErr) return err(500, 'db_error', tErr.message);
  const t = task as Record<string, unknown> & {
    clientes: { nome: string; privado: boolean } | null;
    projetos: { nome: string; privado: boolean } | null;
    pessoas: { nome: string } | null;
  } | null;
  if (!t || !podeVerTarefa(acesso, {
    privada: t.privada as boolean, pessoa_id: t.pessoa_id as string | null,
    cliente_privado: t.clientes?.privado, projeto_privado: t.projetos?.privado,
  })) return err(404, 'task_not_found', `task ${taskId} não existe`);

  const deps = (t.bloqueada_por_tasks as string[] | null) ?? [];
  const [{ data: entries }, { data: hist }, { data: coments }, { data: depTasks }, { data: pessoas }] = await Promise.all([
    sb.from('time_entries').select('pessoa_id, started_at, ended_at').eq('task_id', taskId),
    sb.from('task_field_history')
      .select('field, from_value, to_value, actor_pessoa_id, actor_source, occurred_at')
      .eq('task_id', taskId).in('field', ['subetapa', 'pessoa', 'prazo', 'prioridade'])
      .order('occurred_at', { ascending: false }).limit(50),
    nComent
      ? sb.from('task_comments')
        .select('id, body, posted_em, criado_em, author, visivel_cliente, from_cliente, pessoas:author_pessoa_id ( nome )')
        .eq('task_id', taskId).order('posted_em', { ascending: false, nullsFirst: false }).limit(nComent)
      : Promise.resolve({ data: [] }),
    deps.length ? sb.from('tasks').select('id, titulo, status').in('id', deps) : Promise.resolve({ data: [] }),
    sb.from('pessoas').select('id, nome'),
  ]);
  const nomeDe = new Map((pessoas ?? []).map((x) => [x.id, x.nome as string]));

  let totalMs = 0;
  const porPessoa = new Map<string, number>();
  for (const e of entries ?? []) {
    const ms = (e.ended_at ? Date.parse(e.ended_at) : Date.now()) - Date.parse(e.started_at);
    totalMs += ms;
    const n = nomeDe.get(e.pessoa_id) ?? '—';
    porPessoa.set(n, (porPessoa.get(n) ?? 0) + ms);
  }

  const { clientes, projetos, pessoas: resp, ...campos } = t;
  return json(200, {
    ...campos,
    cliente: clientes?.nome ?? null,
    projeto: projetos?.nome ?? null,
    responsavel: resp?.nome ?? null,
    privada_efetiva: !!(t.privada || clientes?.privado || projetos?.privado),
    atrasada: !!(t.prazo && t.status !== 'concluido' && String(t.prazo) < new Date().toISOString().slice(0, 10)),
    depende_de: (depTasks ?? []).map((d) => ({ id: d.id, titulo: d.titulo, status: d.status })),
    horas: {
      total: h2(totalMs),
      estimado: t.esforco ?? null,
      por_pessoa: [...porPessoa.entries()].sort((a, b) => b[1] - a[1]).map(([nome, ms]) => ({ nome, horas: h2(ms) })),
    },
    historico: (hist ?? []).map((h) => ({
      campo: h.field,
      de: h.field === 'pessoa' ? (h.from_value ? nomeDe.get(h.from_value) ?? h.from_value : null) : h.from_value,
      para: h.field === 'pessoa' ? (h.to_value ? nomeDe.get(h.to_value) ?? h.to_value : null) : h.to_value,
      por: h.actor_pessoa_id ? nomeDe.get(h.actor_pessoa_id) ?? null : null,
      origem: h.actor_source,
      quando: h.occurred_at,
    })),
    comentarios: (coments ?? []).map((c: Record<string, unknown>) => ({
      id: c.id,
      autor: (c.pessoas as { nome: string } | null)?.nome ?? c.author ?? null,
      data: c.posted_em ?? c.criado_em,
      texto: c.body,
      visivel_cliente: c.visivel_cliente === true,
      do_cliente: c.from_cliente === true,
    })),
  });
});
