/**
 * Transição de etapa fora do modal interno (hoje: modal do portal visto pelo
 * time). Segue as mesmas regras do modal da tarefa:
 *   - validateSubetapaAdvance (esforço, horas lançadas, solução ao concluir,
 *     pré-requisitos abertos), com o preenchimento automático de
 *     tempo_real_horas pela soma do timesheet;
 *   - reabrir concluída exige motivo_reabertura;
 *   - a mensagem (homologação, volta para ajuste) vira comentário;
 *   - o motivo do bloqueio vira comentário: visível ao cliente, como
 *     pergunta (kind 'pendencia'), quando o bloqueio é do cliente;
 *   - histórico em task_field_history (actor_source 'app').
 * Status macro e homologacao_em vêm dos triggers do banco.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '@/lib/types';
import { SUB_TO_MACRO } from '@/lib/task-constants';
import { validateSubetapaAdvance } from '@/lib/task-utils';

export interface OpcoesTransicao {
  mensagem?: { body: string; visivel: boolean };
  motivoBloqueio?: string;
}

export interface ContextoTransicao {
  sb: SupabaseClient;
  task: Task;
  /** Horas lançadas na tarefa (timesheet) */
  horasLancadas: number;
  hasOpenPreReqs: boolean;
  pessoa: { id: string; nome: string } | null;
  patchTask: (id: string, changes: Partial<Task>) => unknown;
}

export async function aplicarTransicaoEtapa(
  ctx: ContextoTransicao,
  patch: Partial<Task>,
  opts?: OpcoesTransicao,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sb, task, pessoa, patchTask } = ctx;
  const para = patch.subetapa;
  if (!para || para === task.subetapa) return { ok: true };

  const gate = validateSubetapaAdvance(task, para, { timeEntriesHours: ctx.horasLancadas, hasOpenPreReqs: ctx.hasOpenPreReqs });
  if (!gate.ok) return gate;
  if (task.status === 'concluido' && para !== 'concluido' && !(patch.motivoReabertura ?? '').trim()) {
    return { ok: false, error: 'Informe o motivo da reabertura.' };
  }

  const agora = new Date();
  const iso = agora.toISOString();
  const macro = SUB_TO_MACRO[para] ?? task.status;
  const db: Record<string, unknown> = { subetapa: para, subetapa_em: iso };
  const local: Partial<Task> = { subetapa: para, subetapaEm: agora.getTime() };
  if (macro !== task.status) {
    db.status_em = iso;
    local.status = macro as Task['status'];
    local.statusEm = agora.getTime();
  }
  if (para === 'bloqueado') {
    const por = patch.bloqueadoPor || 'nos';
    db.bloqueado_por = por;
    local.bloqueadoPor = por;
  }
  if (patch.motivoReabertura) {
    db.motivo_reabertura = patch.motivoReabertura;
    local.motivoReabertura = patch.motivoReabertura;
  }
  if (gate.autoFillTempo !== undefined && gate.autoFillTempo > 0 && !(Number(task.tempoRealHoras) > 0)) {
    db.tempo_real_horas = gate.autoFillTempo;
    local.tempoRealHoras = gate.autoFillTempo;
  }
  const paraCliente = para === 'bloqueado' && (patch.bloqueadoPor || 'nos') === 'cliente';
  if (paraCliente && task.pendenciaRespondidaEm) {
    db.pendencia_respondida_em = null;
    local.pendenciaRespondidaEm = null;
  }

  const antes = { ...task };
  patchTask(task.id, local);
  const { error } = await sb.from('tasks').update(db).eq('id', task.id);
  if (error) {
    patchTask(task.id, antes);
    return { ok: false, error: error.message };
  }

  const autorId = pessoa?.id ?? null;
  type Linha = { task_id: string; field: string; from_value: string | null; to_value: string | null; actor_pessoa_id: string | null; actor_source: string; occurred_at: string };
  const historico: Linha[] = [
    { task_id: task.id, field: 'subetapa', from_value: task.subetapa, to_value: para, actor_pessoa_id: autorId, actor_source: 'app', occurred_at: iso },
  ];
  if (macro !== task.status) {
    historico.push({ task_id: task.id, field: 'status', from_value: task.status, to_value: macro, actor_pessoa_id: autorId, actor_source: 'app', occurred_at: iso });
  }
  if (para === 'bloqueado') {
    historico.push({ task_id: task.id, field: 'bloqueado_por', from_value: task.bloqueadoPor || null, to_value: String(db.bloqueado_por), actor_pessoa_id: autorId, actor_source: 'app', occurred_at: iso });
  }
  void sb.from('task_field_history').insert(historico);

  // Texto da transição vira comentário na conversa
  const texto = opts?.mensagem?.body?.trim() || opts?.motivoBloqueio?.trim();
  if (texto) {
    const visivel = opts?.mensagem ? opts.mensagem.visivel : paraCliente;
    const { error: cErr } = await sb.from('task_comments').insert({
      task_id: task.id,
      body: texto,
      author: pessoa?.nome ?? 'app',
      author_pessoa_id: autorId,
      visivel_cliente: visivel,
      from_cliente: false,
      posted_em: iso,
      kind: opts?.motivoBloqueio && paraCliente ? 'pendencia' : null,
    });
    if (cErr) return { ok: false, error: `A etapa mudou, mas a mensagem não foi gravada: ${cErr.message}` };
  }
  return { ok: true };
}
