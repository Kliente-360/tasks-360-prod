// Edge Function: update-task
// Atualiza uma task qualquer pelo id interno (uuid) · usada pela tool MCP
// `update_task`. Diferente da ingest-task, não depende de external_id.
//
// Auth: header x-api-key (INGEST_API_KEYS). Header opcional
// x-tasks360-user (e-mail de quem chamou pelo MCP) vira o autor no histórico.
//
// Body JSON (task_id obrigatório + ao menos um campo):
//   {
//     "task_id": "uuid",
//     "subetapa": "em_homologacao",        // uma das 11 subetapas
//     "status": "concluido",               // macro; usado só se subetapa não vier
//     "bloqueado_por": "cliente",          // nos | cliente | terceiro (só com bloqueado)
//     "valor_entregue": "texto",
//     "solucao_implementada": "texto",
//     "tempo_real_horas": 3.5
//   }
//
// Status vem da subetapa (trigger sync_task_status_from_subetapa). Se só o
// status vier, usa a subetapa padrão do macro. Cada campo alterado vai para
// task_field_history com actor_source 'mcp'.
// Task do Salesforce com webhook ligado dispara task.updated (trigger),
// igual a uma edição feita no app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUBETAPAS = [
  'backlog', 'priorizado', 'em_definicao', 'escopo_definido',
  'em_desenvolvimento', 'em_homologacao', 'em_revisao', 'pronto_producao',
  'em_implantacao', 'bloqueado', 'concluido',
];
const SUB_TO_MACRO: Record<string, string> = {
  backlog: 'backlog', priorizado: 'backlog', em_definicao: 'backlog', escopo_definido: 'backlog',
  em_desenvolvimento: 'andamento', em_homologacao: 'andamento', em_revisao: 'andamento',
  pronto_producao: 'andamento', em_implantacao: 'andamento',
  bloqueado: 'bloqueado', concluido: 'concluido',
};
/** Subetapa usada quando só o status (macro) vem no pedido. */
const MACRO_PADRAO: Record<string, string> = {
  backlog: 'backlog', andamento: 'em_desenvolvimento', bloqueado: 'bloqueado', concluido: 'concluido',
};
const BLOQUEIOS = ['nos', 'cliente', 'terceiro'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const taskId = String(body.task_id ?? '').trim();
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');

  const { data: task, error: tErr } = await sb
    .from('tasks')
    .select('id, titulo, status, subetapa, bloqueado_por, valor_entregue, solucao_implementada, tempo_real_horas, arquivado_em')
    .eq('id', taskId)
    .maybeSingle();
  if (tErr) return err(500, 'db_error', tErr.message);
  if (!task) return err(404, 'task_not_found', `task ${taskId} não existe`);
  if (task.arquivado_em) return err(422, 'task_arquivada', 'task arquivada não pode ser atualizada pelo MCP');

  const upd: Record<string, unknown> = {};

  // Etapa: subetapa manda; status sozinho vira a subetapa padrão do macro
  let subetapa: string | undefined;
  if (body.subetapa !== undefined && body.subetapa !== null && body.subetapa !== '') {
    subetapa = String(body.subetapa).trim().toLowerCase();
    if (!SUBETAPAS.includes(subetapa)) return err(422, 'invalid_subetapa', `subetapa deve ser uma de: ${SUBETAPAS.join(', ')}`);
    if (body.status && SUB_TO_MACRO[subetapa] !== String(body.status).toLowerCase()) {
      return err(422, 'status_conflita', `status '${body.status}' não bate com a subetapa '${subetapa}' (${SUB_TO_MACRO[subetapa]})`);
    }
  } else if (body.status !== undefined && body.status !== null && body.status !== '') {
    const st = String(body.status).trim().toLowerCase();
    if (!MACRO_PADRAO[st]) return err(422, 'invalid_status', 'status deve ser backlog, andamento, bloqueado ou concluido');
    // Mesmo macro: mantém a subetapa atual (não rebaixa "em_homologacao" para "em_desenvolvimento")
    subetapa = SUB_TO_MACRO[task.subetapa] === st ? task.subetapa : MACRO_PADRAO[st];
  }
  if (subetapa && subetapa !== task.subetapa) {
    const agora = new Date().toISOString();
    upd.subetapa = subetapa;
    upd.subetapa_em = agora;
    if (SUB_TO_MACRO[subetapa] !== task.status) upd.status_em = agora;
    if (subetapa === 'bloqueado') {
      const bp = body.bloqueado_por ? String(body.bloqueado_por).toLowerCase() : 'nos';
      if (!BLOQUEIOS.includes(bp)) return err(422, 'invalid_bloqueado_por', 'bloqueado_por deve ser nos, cliente ou terceiro');
      upd.bloqueado_por = bp;
    }
  }

  for (const campo of ['valor_entregue', 'solucao_implementada'] as const) {
    if (body[campo] !== undefined) {
      const v = body[campo] === null ? null : String(body[campo]).trim();
      if ((v ?? null) !== (task[campo] ?? null)) upd[campo] = v;
    }
  }
  if (body.tempo_real_horas !== undefined && body.tempo_real_horas !== null) {
    const h = Number(body.tempo_real_horas);
    if (!Number.isFinite(h) || h < 0 || h > 1000) return err(422, 'invalid_tempo_real_horas', 'tempo_real_horas deve ser um número entre 0 e 1000');
    const arred = Math.round(h * 100) / 100;
    if (arred !== Number(task.tempo_real_horas ?? NaN)) upd.tempo_real_horas = arred;
  }

  if (Object.keys(upd).length === 0) {
    return json(200, { id: task.id, titulo: task.titulo, action: 'unchanged', campos: [] });
  }

  const { data: atualizada, error: uErr } = await sb
    .from('tasks')
    .update(upd)
    .eq('id', taskId)
    .select('id, titulo, status, subetapa, bloqueado_por, valor_entregue, solucao_implementada, tempo_real_horas')
    .single();
  if (uErr) return err(500, 'db_error', uErr.message);

  // Histórico: quem chamou (pelo e-mail do MCP) e o que mudou
  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  let atorId: string | null = null;
  if (email) {
    const { data: p } = await sb.from('pessoas').select('id').ilike('email', email).maybeSingle();
    atorId = p?.id ?? null;
  }
  const agoraIso = new Date().toISOString();
  const mapa: Record<string, string> = {
    subetapa: 'subetapa', valor_entregue: 'valor_entregue',
    solucao_implementada: 'solucao_implementada', tempo_real_horas: 'tempo_real_horas',
  };
  const linhas = Object.keys(mapa)
    .filter((k) => k in upd)
    .map((k) => ({
      task_id: taskId,
      field: mapa[k],
      from_value: task[k as keyof typeof task] == null ? null : String(task[k as keyof typeof task]),
      to_value: upd[k] == null ? null : String(upd[k]),
      actor_pessoa_id: atorId,
      actor_source: 'mcp',
      occurred_at: agoraIso,
    }));
  if (upd.subetapa && SUB_TO_MACRO[String(upd.subetapa)] !== task.status) {
    linhas.push({
      task_id: taskId, field: 'status', from_value: task.status,
      to_value: SUB_TO_MACRO[String(upd.subetapa)], actor_pessoa_id: atorId,
      actor_source: 'mcp', occurred_at: agoraIso,
    });
  }
  if (linhas.length) {
    const { error: hErr } = await sb.from('task_field_history').insert(linhas);
    if (hErr) console.warn('[update-task] histórico', hErr.message);
  }

  return json(200, { ...atualizada, action: 'updated', campos: Object.keys(upd).filter((k) => !k.endsWith('_em')) });
});
