// Edge Function: update-task
// Atualiza uma task qualquer pelo id interno (uuid) · usada pela tool MCP
// `update_task`. Diferente da ingest-task, não depende de external_id.
//
// Auth: header x-api-key (INGEST_API_KEYS). Header x-tasks360-user (e-mail
// de quem chamou pelo MCP) identifica o autor e aplica o acesso do app
// (_shared/acesso.ts): tarefa privada só para o CEO e o responsável; e-mail
// sem cadastro não escreve.
//
// Body JSON (task_id obrigatório + ao menos um campo):
//   {
//     "task_id": "uuid",
//     "subetapa": "em_homologacao",        // uma das 11 subetapas
//     "status": "concluido",               // macro; usado só se subetapa não vier
//     "bloqueado_por": "cliente",          // nos | cliente | terceiro (só com bloqueado)
//     "mensagem": "texto",                 // ao enviar para homologação (o cliente vê)
//     "justificativa": "texto",            // ao voltar da homologação (o cliente vê)
//     "motivo": "texto",                   // ao bloquear
//     "motivo_reabertura": "regressao",    // ao reabrir concluída
//     "titulo": "texto", "prioridade": "P1" | null, "prazo": "YYYY-MM-DD" | null,
//     "responsavel": "nome ou uuid" | null, "esforco": 4,
//     "valor_entregue": "texto", "solucao_implementada": "texto",
//     "tempo_real_horas": 3.5,             // legado (o MCP não expõe mais; use log_horas)
//     "area_tecnica": "automacao"          // ou null para limpar
//   }
//
// Regras de etapa iguais às do modal (exigenciaDaTransicao): a mensagem,
// justificativa ou motivo vira comentário na conversa, com a visibilidade
// que o app usa. Status vem da subetapa (trigger). Cada campo alterado vai
// para task_field_history com actor_source 'mcp'. Esforço segue a trava do
// banco (fora do Backlog só preenche se estava vazio).
// Task do Salesforce com webhook ligado dispara task.updated (trigger),
// igual a uma edição feita no app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { acessoDe, exigenciaDaTransicao, MOTIVOS_REABERTURA, podeEscrever, podeVerTarefa } from '../_shared/acesso.ts';
import { autorDoComentario } from '../_shared/autor.ts';

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
const AREAS = ['configuracao', 'automacao', 'canais_ia', 'marketing', 'integracao', 'frontend', 'consultoria', 'relatorios'];
const PRIORIDADES = ['P0', 'P1', 'P2', 'P3'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

const COLS = 'id, titulo, status, subetapa, bloqueado_por, valor_entregue, solucao_implementada, tempo_real_horas, area_tecnica, prioridade, prazo, pessoa_id, esforco, motivo_reabertura, visivel_cliente, privada, arquivado_em, clientes ( privado ), projetos ( privado )';
const COLS_SAIDA = 'id, titulo, status, subetapa, bloqueado_por, prioridade, prazo, pessoa_id, esforco, valor_entregue, solucao_implementada, tempo_real_horas, area_tecnica';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const texto = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const taskId = String(body.task_id ?? '').trim();
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');

  // Quem chama
  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  const { data: pessoaChamador } = email
    ? await sb.from('pessoas').select('id, nome, role, is_ceo').ilike('email', email).maybeSingle()
    : { data: null };
  const acesso = acessoDe(email, pessoaChamador);
  if (!podeEscrever(acesso)) return err(403, 'forbidden', 'só gente do time cadastrada no Tasks 360 altera tarefas');

  const { data: task, error: tErr } = await sb.from('tasks').select(COLS).eq('id', taskId).maybeSingle();
  if (tErr) return err(500, 'db_error', tErr.message);
  const t = task as Record<string, unknown> & { clientes: { privado: boolean } | null; projetos: { privado: boolean } | null } | null;
  if (!t || !podeVerTarefa(acesso, {
    privada: t.privada as boolean, pessoa_id: t.pessoa_id as string | null,
    cliente_privado: t.clientes?.privado, projeto_privado: t.projetos?.privado,
  })) return err(404, 'task_not_found', `task ${taskId} não existe`);
  if (t.arquivado_em) return err(422, 'task_arquivada', 'task arquivada não pode ser atualizada pelo MCP');

  const upd: Record<string, unknown> = {};
  const avisos: string[] = [];

  // ── Etapa: subetapa manda; status sozinho vira a subetapa padrão do macro
  const subAtual = String(t.subetapa);
  let subetapa: string | undefined;
  if (texto(body.subetapa)) {
    subetapa = texto(body.subetapa).toLowerCase();
    if (!SUBETAPAS.includes(subetapa)) return err(422, 'invalid_subetapa', `subetapa deve ser uma de: ${SUBETAPAS.join(', ')}`);
    if (body.status && SUB_TO_MACRO[subetapa] !== String(body.status).toLowerCase()) {
      return err(422, 'status_conflita', `status '${body.status}' não bate com a subetapa '${subetapa}' (${SUB_TO_MACRO[subetapa]})`);
    }
  } else if (texto(body.status)) {
    const st = texto(body.status).toLowerCase();
    if (!MACRO_PADRAO[st]) return err(422, 'invalid_status', 'status deve ser backlog, andamento, bloqueado ou concluido');
    // Mesmo macro: mantém a subetapa atual (não rebaixa "em_homologacao" para "em_desenvolvimento")
    subetapa = SUB_TO_MACRO[subAtual] === st ? subAtual : MACRO_PADRAO[st];
  }

  // Comentário que acompanha a transição (mensagem, justificativa, motivo)
  let comentario: { body: string; visivel: boolean; kind: string | null } | null = null;
  if (subetapa && subetapa !== subAtual) {
    const bp = subetapa === 'bloqueado' ? (body.bloqueado_por ? String(body.bloqueado_por).toLowerCase() : 'nos') : undefined;
    if (bp && !BLOQUEIOS.includes(bp)) return err(422, 'invalid_bloqueado_por', 'bloqueado_por deve ser nos, cliente ou terceiro');
    const exige = exigenciaDaTransicao(subAtual, subetapa, bp);
    if (exige) {
      if (exige.campo === 'motivo_reabertura') {
        const m = texto(body.motivo_reabertura);
        if (!(MOTIVOS_REABERTURA as readonly string[]).includes(m)) return err(422, 'missing_motivo_reabertura', exige.motivo);
        upd.motivo_reabertura = m;
      } else {
        const valor = texto(body[exige.campo]);
        if (!valor) return err(422, `missing_${exige.campo}`, exige.motivo);
        // Tarefa oculta para o cliente: a mensagem fica interna
        const visivel = exige.visivelCliente && t.visivel_cliente !== false;
        comentario = { body: valor, visivel, kind: exige.campo === 'motivo' && visivel ? 'pendencia' : null };
      }
    }
    const agora = new Date().toISOString();
    upd.subetapa = subetapa;
    upd.subetapa_em = agora;
    if (SUB_TO_MACRO[subetapa] !== t.status) upd.status_em = agora;
    if (bp) upd.bloqueado_por = bp;
  }

  // ── Campos simples
  if (body.titulo !== undefined) {
    const v = texto(body.titulo);
    if (!v) return err(422, 'invalid_titulo', 'titulo não pode ficar vazio');
    if (v.length > 300) return err(422, 'invalid_titulo', 'titulo com mais de 300 caracteres');
    if (v !== t.titulo) upd.titulo = v;
  }
  if (body.prioridade !== undefined) {
    const v = body.prioridade === null || body.prioridade === '' ? null : texto(body.prioridade).toUpperCase();
    if (v !== null && !PRIORIDADES.includes(v)) return err(422, 'invalid_prioridade', 'prioridade deve ser P0, P1, P2, P3 ou null');
    if (v !== (t.prioridade ?? null)) upd.prioridade = v;
  }
  if (body.prazo !== undefined) {
    const v = body.prazo === null || body.prazo === '' ? null : texto(body.prazo);
    if (v !== null && (!DATA_RE.test(v) || Number.isNaN(Date.parse(v)))) return err(422, 'invalid_prazo', 'prazo deve ser YYYY-MM-DD ou null');
    if (v !== (t.prazo ?? null)) upd.prazo = v;
  }
  if (body.responsavel !== undefined) {
    let v: string | null = null;
    const r = body.responsavel === null ? '' : texto(body.responsavel);
    if (r) {
      let q = sb.from('pessoas').select('id').in('role', ['admin', 'interno']).is('arquivado_em', null);
      q = UUID_RE.test(r) ? q.eq('id', r) : q.ilike('nome', `${r}%`);
      const { data: ps, error: pErr } = await q.limit(2);
      if (pErr) return err(500, 'db_error', pErr.message);
      if (!ps?.length) return err(404, 'pessoa_not_found', `ninguém do time encontrado para "${r}"`);
      if (ps.length > 1) return err(422, 'pessoa_ambigua', `"${r}" bate com mais de uma pessoa; use o uuid de get_pessoas`);
      v = ps[0].id;
    }
    if (v !== (t.pessoa_id ?? null)) upd.pessoa_id = v;
  }
  if (body.esforco !== undefined && body.esforco !== null) {
    const h = Number(body.esforco);
    if (!Number.isFinite(h) || h < 0 || h > 1000) return err(422, 'invalid_esforco', 'esforco deve ser um número de horas entre 0 e 1000');
    if (h !== Number(t.esforco ?? 0)) upd.esforco = h;
  }
  for (const campo of ['valor_entregue', 'solucao_implementada'] as const) {
    if (body[campo] !== undefined) {
      const v = body[campo] === null ? null : String(body[campo]).trim();
      if ((v ?? null) !== (t[campo] ?? null)) upd[campo] = v;
    }
  }
  if (body.tempo_real_horas !== undefined && body.tempo_real_horas !== null) {
    const h = Number(body.tempo_real_horas);
    if (!Number.isFinite(h) || h < 0 || h > 1000) return err(422, 'invalid_tempo_real_horas', 'tempo_real_horas deve ser um número entre 0 e 1000');
    const arred = Math.round(h * 100) / 100;
    if (arred !== Number(t.tempo_real_horas ?? NaN)) upd.tempo_real_horas = arred;
  }
  if (body.area_tecnica !== undefined) {
    const area = body.area_tecnica === null || body.area_tecnica === '' ? null : String(body.area_tecnica).toLowerCase();
    if (area !== null && !AREAS.includes(area)) return err(422, 'invalid_area_tecnica', `area_tecnica deve ser uma de: ${AREAS.join(', ')}`);
    if (area !== (t.area_tecnica ?? null)) upd.area_tecnica = area;
  }

  if (Object.keys(upd).length === 0) {
    return json(200, { id: t.id, titulo: t.titulo, action: 'unchanged', campos: [] });
  }

  const { data: atualizada, error: uErr } = await sb.from('tasks').update(upd).eq('id', taskId).select(COLS_SAIDA).single();
  if (uErr) return err(500, 'db_error', uErr.message);

  // Esforço fora do Backlog com estimativa: o banco mantém o valor antigo
  if ('esforco' in upd && Number(atualizada.esforco ?? 0) !== Number(upd.esforco)) {
    avisos.push('esforço não mudou: a tarefa já saiu do Backlog com estimativa, e ela fica travada');
    delete upd.esforco;
  }

  const atorId = acesso.tipo === 'pessoa' ? acesso.id : null;
  const agoraIso = new Date().toISOString();

  // Comentário da transição (mesmo formato do modal)
  if (comentario) {
    const assinatura = autorDoComentario(
      acesso.tipo === 'pessoa' ? { id: acesso.id, nome: acesso.nome } : null,
      Deno.env.get('MCP_COMMENT_AUTHOR_DEFAULT'),
    );
    const { error: cErr } = await sb.from('task_comments').insert({
      task_id: taskId,
      body: comentario.body,
      author: assinatura.nome,
      author_pessoa_id: assinatura.pessoaId,
      visivel_cliente: comentario.visivel,
      from_cliente: false,
      posted_em: agoraIso,
      kind: comentario.kind,
    });
    if (cErr) avisos.push(`a etapa mudou, mas a mensagem não foi gravada: ${cErr.message}`);
  }

  // Histórico: o que mudou e quem mudou
  const mapa: Record<string, string> = {
    subetapa: 'subetapa', titulo: 'titulo', prioridade: 'prioridade', prazo: 'prazo',
    pessoa_id: 'pessoa', esforco: 'esforco', bloqueado_por: 'bloqueado_por',
    valor_entregue: 'valor_entregue', solucao_implementada: 'solucao_implementada',
    tempo_real_horas: 'tempo_real_horas', area_tecnica: 'area_tecnica',
  };
  const linhas = Object.keys(mapa)
    .filter((k) => k in upd)
    .map((k) => ({
      task_id: taskId,
      field: mapa[k],
      from_value: t[k] == null ? null : String(t[k]),
      to_value: upd[k] == null ? null : String(upd[k]),
      actor_pessoa_id: atorId,
      actor_source: 'mcp',
      occurred_at: agoraIso,
    }));
  if (upd.subetapa && SUB_TO_MACRO[String(upd.subetapa)] !== t.status) {
    linhas.push({
      task_id: taskId, field: 'status', from_value: String(t.status),
      to_value: SUB_TO_MACRO[String(upd.subetapa)], actor_pessoa_id: atorId,
      actor_source: 'mcp', occurred_at: agoraIso,
    });
  }
  if (linhas.length) {
    const { error: hErr } = await sb.from('task_field_history').insert(linhas);
    if (hErr) console.warn('[update-task] histórico', hErr.message);
  }

  const campos = Object.keys(upd).filter((k) => !k.endsWith('_em'));
  return json(200, {
    ...atualizada,
    action: campos.length ? 'updated' : 'unchanged',
    campos,
    ...(comentario ? { comentario: { texto: comentario.body, visivel_cliente: comentario.visivel } } : {}),
    ...(avisos.length ? { avisos } : {}),
  });
});
