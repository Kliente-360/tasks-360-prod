'use client';

/**
 * Meu Foco — lista plana com pills de filtro (OR).
 *
 * Tasks aparecem uma vez cada, ordenadas por pill-idx → prioridade →
 * prazo asc. Pills: atrasada, pra hoje, bloqueada, sem esforço,
 * sem hora realizada, sem comentário, P0/P1.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData, usePessoasById, useClientesById, useProjetosById } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/page-header';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  atrasada,
  diasAtraso,
  etapaTempoColor,
  etapaTempoDays,
  fmtAtrasoLabel,
  fmtDateShort,
  isPreTriagem,
  TRIAGE_RANK_GATE,
} from '@/lib/task-utils';
import { STATUS, STAGE_RANK, SUB_LABELS, SUB_TO_MACRO } from '@/lib/task-constants';
import { useLastCommentByTask } from '@/lib/use-last-comment';
import { useFocoDone, type FocoContexto } from '@/lib/use-foco-done';
import { createClient } from '@/lib/supabase/client';
import type { Task } from '@/lib/types';

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const SEM_COMMENT_HOURS = 24;

const MOTIVOS_BLOQUEIO = [
  'Aguardando cliente',
  'Aguardando aprovação interna',
  'Aguardando dependência externa',
  'Aguardando informação',
  'Bloqueio técnico',
] as const;

const PILL_ORDER: FocoContexto[] = [
  'atrasadas', 'hoje', 'bloqueadas', 'sem_esforco', 'sem_horas', 'sem_comment',
];

const PILL_LABELS: Record<FocoContexto, string> = {
  atrasadas: 'atrasada',
  hoje: 'pra hoje',
  bloqueadas: 'bloqueada',
  sem_esforco: 'sem esforço',
  sem_horas: 'sem hora realizada',
  sem_comment: 'sem comentário',
};

export function FocoClient() {
  const { tasks, loading, error, currentPessoa, viewerRole } = useData();
  const isCliente = viewerRole === 'cliente';
  const { openEdit } = useTaskModal();
  const pessoasById = usePessoasById();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const focusPessoaId = currentPessoa?.id ?? '';

  const [pillPrio, setPillPrio] = useState(false);
  const [activePills, setActivePills] = useState<Set<FocoContexto>>(new Set());
  const togglePill = useCallback((k: FocoContexto) => {
    setActivePills((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const { isResolved, toggle: toggleResolved } = useFocoDone();

  const mine = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.pessoaId === focusPessoaId &&
          !t.arquivadoEm &&
          t.status !== STATUS.CONCLUIDO &&
          !isPreTriagem(t),
      ),
    [tasks, focusPessoaId],
  );

  const andamentoIds = useMemo(
    () => mine.filter((t) => t.status === 'andamento').map((t) => t.id),
    [mine],
  );
  const { lastCommentMap, markCommented } = useLastCommentByTask(
    andamentoIds,
    focusPessoaId || null,
  );

  const groups = useMemo<Record<FocoContexto, Task[]>>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = Date.now() - SEM_COMMENT_HOURS * 3600 * 1000;
    const sortPri = (a: Task, b: Task) =>
      (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9);

    const atrasadas = mine
      .filter((t) => atrasada(t))
      .sort((a, b) => diasAtraso(b) - diasAtraso(a) || sortPri(a, b));

    const hoje = mine
      .filter((t) => t.prazo === today && !atrasada(t))
      .sort(sortPri);

    const bloqueadas = mine
      .filter((t) => t.status === 'bloqueado')
      .sort((a, b) => (b.statusEm || 0) - (a.statusEm || 0));

    const sem_comment = mine
      .filter((t) => {
        if (t.status !== 'andamento') return false;
        const last = lastCommentMap.get(t.id);
        return !last || last.getTime() < cutoff;
      })
      .sort((a, b) => {
        const la = lastCommentMap.get(a.id)?.getTime() ?? 0;
        const lb = lastCommentMap.get(b.id)?.getTime() ?? 0;
        return la - lb;
      });

    const sem_esforco = mine
      .filter(
        (t) =>
          (!Number(t.esforco) || t.esforco <= 0) &&
          (STAGE_RANK[t.subetapa] ?? 0) >= TRIAGE_RANK_GATE,
      )
      .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));

    const sem_horas = mine
      .filter(
        (t) =>
          t.status === 'andamento' &&
          (!Number(t.tempoRealHoras) || Number(t.tempoRealHoras) <= 0),
      )
      .sort((a, b) => (b.statusEm || 0) - (a.statusEm || 0));

    return { atrasadas, hoje, bloqueadas, sem_comment, sem_esforco, sem_horas };
  }, [mine, lastCommentMap]);

  // taskId → all contexts it belongs to
  const taskCtxMap = useMemo(() => {
    const map = new Map<string, Set<FocoContexto>>();
    for (const ctx of PILL_ORDER) {
      for (const t of groups[ctx]) {
        if (!map.has(t.id)) map.set(t.id, new Set());
        map.get(t.id)!.add(ctx);
      }
    }
    return map;
  }, [groups]);

  // Flat deduped list: each task once under its first (primary) ctx.
  // Sorted: ctxIdx → prio asc → prazo asc.
  const focoFlat = useMemo(() => {
    const seen = new Set<string>();
    const entries: Array<{ task: Task; primaryCtx: FocoContexto; ctxIdx: number }> = [];
    for (let i = 0; i < PILL_ORDER.length; i++) {
      for (const t of groups[PILL_ORDER[i]]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          entries.push({ task: t, primaryCtx: PILL_ORDER[i], ctxIdx: i });
        }
      }
    }
    entries.sort((a, b) => {
      if (a.ctxIdx !== b.ctxIdx) return a.ctxIdx - b.ctxIdx;
      const pd = (PRIO_RANK[a.task.prioridade] ?? 9) - (PRIO_RANK[b.task.prioridade] ?? 9);
      if (pd !== 0) return pd;
      const pa = a.task.prazo || '9999';
      const pb = b.task.prazo || '9999';
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
    return entries;
  }, [groups]);

  // OR pill filter + AND prio filter
  const focoFiltered = useMemo(() => {
    let result = focoFlat;
    if (activePills.size > 0) {
      result = result.filter(({ task }) => {
        const ctxs = taskCtxMap.get(task.id);
        if (!ctxs) return false;
        for (const p of activePills) {
          if (ctxs.has(p)) return true;
        }
        return false;
      });
    }
    if (pillPrio) {
      result = result.filter(({ task }) => task.prioridade === 'P0' || task.prioridade === 'P1');
    }
    return result;
  }, [focoFlat, activePills, pillPrio, taskCtxMap]);

  // Per-pill counts (raw, prio filter applied)
  const counts = useMemo(() => {
    const c: Record<FocoContexto, number> = {
      atrasadas: 0, hoje: 0, bloqueadas: 0,
      sem_comment: 0, sem_esforco: 0, sem_horas: 0,
    };
    for (const ctx of PILL_ORDER) {
      const arr = pillPrio
        ? groups[ctx].filter((t) => t.prioridade === 'P0' || t.prioridade === 'P1')
        : groups[ctx];
      c[ctx] = arr.length;
    }
    return c;
  }, [groups, pillPrio]);

  // Resolved-aware counts for narrative
  const pending = useMemo(() => {
    const c: Record<FocoContexto, number> = {
      atrasadas: 0, hoje: 0, bloqueadas: 0,
      sem_comment: 0, sem_esforco: 0, sem_horas: 0,
    };
    for (const ctx of PILL_ORDER) {
      const arr = pillPrio
        ? groups[ctx].filter((t) => t.prioridade === 'P0' || t.prioridade === 'P1')
        : groups[ctx];
      let n = 0;
      for (const t of arr) {
        if (!isResolved(t.id, ctx)) n++;
      }
      c[ctx] = n;
    }
    return c;
  }, [groups, pillPrio, isResolved]);

  const totalPending =
    pending.atrasadas + pending.hoje + pending.bloqueadas +
    pending.sem_comment + pending.sem_esforco + pending.sem_horas;

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', day: 'numeric', month: 'long',
      }),
    [],
  );

  const headline = useMemo(() => {
    if (totalPending === 0) return 'Tudo no controle.';
    const parts: string[] = [];
    if (pending.atrasadas) parts.push(`<strong>${pending.atrasadas}</strong> atrasada${pending.atrasadas > 1 ? 's' : ''}`);
    if (pending.hoje) parts.push(`<strong>${pending.hoje}</strong> pra hoje`);
    if (pending.bloqueadas) parts.push(`<strong>${pending.bloqueadas}</strong> bloqueada${pending.bloqueadas > 1 ? 's' : ''}`);
    if (pending.sem_comment) parts.push(`<strong>${pending.sem_comment}</strong> sem comentário`);
    if (pending.sem_esforco) parts.push(`<strong>${pending.sem_esforco}</strong> sem esforço`);
    if (pending.sem_horas) parts.push(`<strong>${pending.sem_horas}</strong> sem horas`);
    return parts.length === 1
      ? parts[0]
      : parts.slice(0, -1).join(', ') + ' e ' + parts.slice(-1)[0];
  }, [pending, totalPending]);

  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;
  const hasFocus = !!focusPessoaId;

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          title={
            hasFocus ? (
              <>Foco de {pessoasById.get(focusPessoaId)?.nome ?? '—'}</>
            ) : (
              'Foco indisponível'
            )
          }
          right={
            hasFocus ? (
              <div className="flex items-center gap-2 flex-wrap">
                {PILL_ORDER.map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    className={cn('triage-filter-chip', activePills.has(pill) && 'is-on')}
                    onClick={() => togglePill(pill)}
                  >
                    <strong>{counts[pill]}</strong>&nbsp;{PILL_LABELS[pill]}
                  </button>
                ))}
                <button
                  type="button"
                  className={cn('triage-filter-chip', pillPrio && 'is-on')}
                  onClick={() => setPillPrio((v) => !v)}
                >
                  P0/P1
                </button>
              </div>
            ) : null
          }
        />
      </div>

      {!hasFocus && (
        <div className="card p-6 md:p-10 text-center">
          <div className="font-brand text-lg md:text-xl font-semibold mb-2">
            {isCliente ? 'Foco indisponível' : 'Sem pessoa vinculada'}
          </div>
          <div className="text-ink-soft text-sm">
            {isCliente
              ? 'Esta área é interna do time.'
              : 'Sua sessão não está ligada a uma pessoa cadastrada. Peça pro admin verificar.'}
          </div>
        </div>
      )}

      {hasFocus && (
        <div className="md:hidden">
          <div className="m-pagetitle">
            <h1>Foco de <em>hoje</em></h1>
            <div className="narr">
              <b>{totalPending}</b> pendente{totalPending !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-2 mb-3">
            {PILL_ORDER.map((pill) => (
              <button
                key={pill}
                type="button"
                className={cn('triage-filter-chip', activePills.has(pill) && 'is-on')}
                onClick={() => togglePill(pill)}
              >
                <strong>{counts[pill]}</strong>&nbsp;{PILL_LABELS[pill]}
              </button>
            ))}
            <button
              type="button"
              className={cn('triage-filter-chip', pillPrio && 'is-on')}
              onClick={() => setPillPrio((v) => !v)}
            >
              P0/P1
            </button>
          </div>
        </div>
      )}

      {hasFocus && (
        <div className="space-y-4">
          {/* Seu dia · narrativa */}
          <div
            className="card p-4 md:p-5 min-h-[116px] flex flex-col justify-center"
            style={{ borderLeft: '3px solid var(--brand)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
              Seu dia · {todayLabel}
            </div>
            <div
              className="text-base md:text-lg leading-snug"
              dangerouslySetInnerHTML={{ __html: headline }}
            />
            {totalPending > 0 && (
              <div className="mt-1 text-xs text-muted">
                {totalPending === 1 ? '1 item pendente' : `${totalPending} itens pendentes`}
                {' no total'}
              </div>
            )}
          </div>

          {/* Lista plana */}
          {focoFiltered.length === 0 ? (
            <div className="card text-center py-6 px-3 text-muted text-xs italic">
              {activePills.size > 0 || pillPrio
                ? 'Nenhuma task neste filtro.'
                : 'Tudo no controle.'}
            </div>
          ) : (
            <div className="space-y-2">
              {focoFiltered.map(({ task, primaryCtx }) => (
                <FocoTaskRow
                  key={task.id}
                  task={task}
                  contexto={primaryCtx}
                  resolved={isResolved(task.id, primaryCtx)}
                  onToggleResolved={() => toggleResolved(task.id, primaryCtx)}
                  lastComment={lastCommentMap.get(task.id) ?? null}
                  clienteName={clientesById.get(task.clienteId)?.nome ?? '—'}
                  projetoName={projetosById.get(task.projetoId)?.nome ?? '—'}
                  openEdit={openEdit}
                  markCommented={markCommented}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =========================================================================
//  Linha · card largo · 5 inputs padronizados + motivo (cond.) + comment
// =========================================================================

function FocoTaskRow({
  task,
  contexto,
  resolved,
  onToggleResolved,
  lastComment,
  clienteName,
  projetoName,
  openEdit,
  markCommented,
}: {
  task: Task;
  contexto: FocoContexto;
  resolved: boolean;
  onToggleResolved: () => void;
  lastComment: Date | null;
  clienteName: string;
  projetoName: string;
  openEdit: (id: string) => void;
  /** Optimistic update do lastCommentMap quando assignee comenta. */
  markCommented: (taskId: string, when?: Date) => void;
}) {
  const toast = useToast();
  const sb = useMemo(() => createClient(), []);
  const { patchTask, currentPessoa } = useData();

  type Draft = {
    prazo: string;
    subetapa: string;
    esforco: number;
    tempoRealHoras: number;
    motivo: string;
    comment: string;
  };
  const initial = useMemo<Draft>(
    () => ({
      prazo: task.prazo || '',
      subetapa: task.subetapa || '',
      esforco: Number(task.esforco) || 0,
      tempoRealHoras: Number(task.tempoRealHoras) || 0,
      motivo: '',
      comment: '',
    }),
    [task.prazo, task.subetapa, task.esforco, task.tempoRealHoras],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  useEffect(() => {
    setDraft((d) => ({ ...d, ...initial, motivo: d.motivo, comment: d.comment }));
  }, [initial]);

  const motivoRequired = draft.subetapa === 'bloqueado';

  const isDirty =
    draft.prazo !== (task.prazo || '') ||
    draft.subetapa !== task.subetapa ||
    draft.esforco !== (Number(task.esforco) || 0) ||
    draft.tempoRealHoras !== (Number(task.tempoRealHoras) || 0) ||
    draft.comment.trim() !== '' ||
    (motivoRequired && draft.motivo.trim() !== '');

  const faltam: string[] = [];
  if (motivoRequired && !draft.motivo.trim()) faltam.push('motivo');
  switch (contexto) {
    case 'bloqueadas':
      // Sem requisito de mudar subetapa. Usuário pode (1) desbloquear
      // mudando a subetapa OU (2) atualizar mantendo bloqueado — neste
      // caso exigimos comentário (motivo já é obrigatório pelo gate
      // global motivoRequired quando subetapa = bloqueado).
      if (draft.subetapa === 'bloqueado' && !draft.comment.trim()) {
        faltam.push('comentário');
      }
      break;
    case 'sem_comment':
      if (!draft.comment.trim()) faltam.push('comentário');
      break;
    case 'sem_esforco':
      if (!draft.esforco || draft.esforco <= 0) faltam.push('esforço');
      break;
    case 'sem_horas':
      if (!draft.tempoRealHoras || draft.tempoRealHoras <= 0) faltam.push('horas');
      break;
    case 'atrasadas':
    case 'hoje':
      if (!draft.prazo) faltam.push('prazo');
      if (!draft.subetapa) faltam.push('subetapa');
      break;
  }
  const canSave = isDirty && faltam.length === 0;

  const persist = useCallback(async () => {
    const dbPatch: Record<string, unknown> = {};
    const localPatch: Partial<Task> = {};
    if (draft.prazo !== (task.prazo || '')) {
      dbPatch.prazo = draft.prazo || null;
      localPatch.prazo = draft.prazo;
    }
    if (draft.subetapa !== task.subetapa) {
      dbPatch.subetapa = draft.subetapa;
      localPatch.subetapa = draft.subetapa;
      // Status macro deriva da subetapa via trigger no DB; replicamos
      // localmente pra que `bloqueadas` / `sem_horas` re-avaliem
      // imediatamente sem esperar refetch.
      const newStatus = SUB_TO_MACRO[draft.subetapa] || task.status;
      if (newStatus !== task.status) {
        localPatch.status = newStatus as Task['status'];
      }
    }
    if (draft.esforco !== (Number(task.esforco) || 0)) {
      dbPatch.esforco = draft.esforco;
      localPatch.esforco = draft.esforco;
    }
    if (draft.tempoRealHoras !== (Number(task.tempoRealHoras) || 0)) {
      dbPatch.tempo_real_horas = draft.tempoRealHoras;
      localPatch.tempoRealHoras = draft.tempoRealHoras;
    }
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await sb.from('tasks').update(dbPatch).eq('id', task.id);
      if (error) {
        toast.error('Erro: ' + error.message);
        return;
      }
      patchTask(task.id, localPatch);
    }

    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const commentsToInsert: Record<string, unknown>[] = [];
    if (motivoRequired && draft.motivo.trim()) {
      commentsToInsert.push({
        task_id: task.id,
        body: `Bloqueio: ${draft.motivo.trim()}`,
        author: currentPessoa?.nome ?? 'app',
        author_pessoa_id: currentPessoa?.id ?? null,
        visivel_cliente: false,
        from_cliente: false,
        posted_em: nowIso,
      });
    }
    if (draft.comment.trim()) {
      commentsToInsert.push({
        task_id: task.id,
        body: draft.comment.trim(),
        author: currentPessoa?.nome ?? 'app',
        author_pessoa_id: currentPessoa?.id ?? null,
        visivel_cliente: false,
        from_cliente: false,
        posted_em: nowIso,
      });
    }
    const commentedByAssignee =
      commentsToInsert.length > 0 && task.pessoaId === currentPessoa?.id;
    if (commentsToInsert.length) {
      const { error } = await sb.from('task_comments').insert(commentsToInsert);
      if (error) {
        toast.error('Salvo, mas comentário falhou: ' + error.message);
      } else if (commentedByAssignee) {
        // Optimistic — sem isso, a task continuaria em "Sem comentário"
        // até o próximo reload (lastCommentMap é fetched no mount).
        markCommented(task.id, nowDate);
      }
    }

    // Determina se task AINDA bate o critério do contexto primário
    // após o save. Se sim → marca como Resolved (fica visível, count
    // decrementa). Se não → drops out naturalmente, sem auto-mark.
    const updated: Task = { ...task, ...localPatch };
    const stillMatches = matchesContext(updated, contexto, {
      justCommentedByAssignee: commentedByAssignee,
    });
    if (stillMatches && !resolved) {
      onToggleResolved();
    }

    toast.success('Salvo.');
    setDraft((d) => ({ ...d, motivo: '', comment: '' }));
  }, [draft, task, sb, patchTask, toast, currentPessoa, motivoRequired, resolved, onToggleResolved, markCommented, contexto]);

  const etapaCor = etapaTempoColor(task);
  const etapaDias = etapaTempoDays(task);
  const corFrase =
    etapaCor === 'danger'
      ? { color: 'var(--danger)', fontWeight: 600 }
      : etapaCor === 'warn'
      ? { color: 'var(--warn)', fontWeight: 600 }
      : undefined;
  const late = atrasada(task);

  return (
    <div
      className={cn(
        'card p-3 md:p-4 transition-colors',
        resolved && 'opacity-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="cursor-pointer hover:opacity-90 flex-1 min-w-0"
          onClick={() => openEdit(task.id)}
        >
          {/* Linha 1 · prio + flags + título */}
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className={`pri pri-${task.prioridade}`}>
              <span className="pri-dot" />
              {task.prioridade}
            </span>
            <span
              className={cn(
                'font-medium text-ink break-words',
                resolved && 'line-through text-muted',
              )}
            >
              {task.titulo}
            </span>
          </div>

          {/* Linha 2 · meta */}
          <div className="text-xs text-muted font-mono break-words">
            <span>{SUB_LABELS[task.subetapa] ?? task.subetapa}</span>
            <span> · </span>
            <span style={corFrase}>
              {etapaDias <= 0 ? 'hoje' : etapaDias === 1 ? '1 dia' : `${etapaDias} dias`} nesta etapa
            </span>
            {task.prazo && (
              <>
                <span> · </span>
                <span className={late ? 'text-[color:var(--danger)] font-semibold' : ''}>
                  prazo {fmtDateShort(task.prazo)}
                  {late && ` · ${fmtAtrasoLabel(diasAtraso(task))}`}
                </span>
              </>
            )}
            {contexto === 'sem_comment' && (
              <>
                <span> · </span>
                <span>último comment: {lastComment ? fmtRelative(lastComment) : 'nunca'}</span>
              </>
            )}
          </div>

          {/* Linha 3 · cliente · projeto */}
          <div className="text-xs text-ink-soft mt-1">
            {clienteName} · {projetoName}
          </div>
        </div>

        {/* Botões no topo direito */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="triage-chip hidden md:inline-block">{PILL_LABELS[contexto]}</span>
          <button
            type="button"
            onClick={onToggleResolved}
            className="btn btn-ghost text-xs flex items-center gap-1"
            title={resolved ? 'Desmarcar resolvido hoje' : 'Marcar como resolvido (só hoje · não persiste)'}
          >
            <Icon name="check" size={13} />
            {resolved ? 'Resolvido' : 'Resolver'}
          </button>
          <button
            type="button"
            onClick={canSave ? persist : undefined}
            disabled={!canSave}
            className="btn btn-primary text-xs"
            title={
              canSave
                ? 'Salvar'
                : !isDirty
                  ? 'Sem mudanças pra salvar'
                  : `Falta: ${faltam.join(', ')}`
            }
            style={!canSave ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
          >
            Salvar
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-3 pt-3 border-t border-line flex items-center gap-2 flex-nowrap overflow-x-auto">
        {/* 1. Prazo */}
        <span className="triage-inline-field w-[150px] shrink-0" title="Prazo">
          <Icon name="calendar" size={13} className="ic" />
          <input
            type="date"
            value={draft.prazo}
            onChange={(e) => setDraft((d) => ({ ...d, prazo: e.target.value }))}
            className="triage-inline-select"
          />
        </span>
        {/* 2. Esforço previsto */}
        <span className="triage-inline-field w-[95px] shrink-0" title="Esforço previsto (h)">
          <Icon name="hourglass" size={13} className="ic" />
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.esforco || ''}
            onChange={(e) => setDraft((d) => ({ ...d, esforco: Number(e.target.value) || 0 }))}
            placeholder="esf"
            className="triage-inline-select"
          />
        </span>
        {/* 3. Horas realizadas */}
        <span className="triage-inline-field w-[95px] shrink-0" title="Horas realizadas">
          <Icon name="timer" size={13} className="ic" />
          <input
            type="number"
            min={0}
            step={0.25}
            value={draft.tempoRealHoras || ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, tempoRealHoras: Number(e.target.value) || 0 }))
            }
            placeholder="hrs"
            className="triage-inline-select"
          />
        </span>
        {/* 4. Subetapa */}
        <span className="triage-inline-field w-[150px] shrink-0" title="Subetapa">
          <Icon name="list-filter" size={13} className="ic" />
          <select
            value={draft.subetapa}
            onChange={(e) => setDraft((d) => ({ ...d, subetapa: e.target.value }))}
            className="triage-inline-select"
          >
            {Object.keys(SUB_LABELS).map((k) => (
              <option key={k} value={k}>
                {SUB_LABELS[k]}
              </option>
            ))}
          </select>
        </span>
        {/* 5. Motivo (habilitado só se subetapa = bloqueado) */}
        <span
          className={cn(
            'triage-inline-field w-[170px] shrink-0',
            !motivoRequired && 'opacity-50',
          )}
          title={
            motivoRequired
              ? 'Motivo do bloqueio (obrigatório)'
              : 'Disponível se subetapa = Bloqueado'
          }
        >
          <Icon name="lock" size={13} className="ic" />
          <select
            value={draft.motivo}
            onChange={(e) => setDraft((d) => ({ ...d, motivo: e.target.value }))}
            disabled={!motivoRequired}
            className="triage-inline-select"
          >
            <option value="">{motivoRequired ? '— motivo —' : 'motivo'}</option>
            {MOTIVOS_BLOQUEIO.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </span>
        {/* 6. Comment */}
        <span
          className="triage-inline-field flex-1 min-w-[140px]"
          title="Comentário rápido (opcional)"
        >
          <Icon name="comment" size={13} className="ic" />
          <input
            type="text"
            value={draft.comment}
            onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
            placeholder="Comentário rápido (opcional)…"
            className="triage-inline-select"
          />
        </span>
      </div>
    </div>
  );
}

function fmtRelative(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `${days}d atrás`;
}

/** Decide se uma task ainda bate no critério de um contexto · usado
 *  pós-save pra decidir entre 'mark resolved' (still matches → stays
 *  visible, count decrementa) e 'drops out' (criterion broke). */
function matchesContext(
  t: Task,
  ctx: FocoContexto,
  opts: { justCommentedByAssignee: boolean },
): boolean {
  const today = new Date().toISOString().slice(0, 10);
  switch (ctx) {
    case 'atrasadas':
      return atrasada(t);
    case 'hoje':
      return t.prazo === today && !atrasada(t);
    case 'bloqueadas':
      return t.status === 'bloqueado';
    case 'sem_esforco':
      return (
        (!Number(t.esforco) || t.esforco <= 0) &&
        (STAGE_RANK[t.subetapa] ?? 0) >= TRIAGE_RANK_GATE
      );
    case 'sem_horas':
      return (
        t.status === 'andamento' &&
        (!Number(t.tempoRealHoras) || Number(t.tempoRealHoras) <= 0)
      );
    case 'sem_comment':
      // Se acabou de comentar como responsável, deixa de matchar.
      if (opts.justCommentedByAssignee) return false;
      return t.status === 'andamento';
  }
}


/** Hook helper exportado pra computar count do Foco no header. */
export function computeFocoCount(args: {
  tasks: Task[];
  pessoaId: string | null;
  isResolved: (taskId: string, contexto: FocoContexto) => boolean;
}): number {
  if (!args.pessoaId) return 0;
  const mine = args.tasks.filter(
    (t) =>
      t.pessoaId === args.pessoaId &&
      !t.arquivadoEm &&
      t.status !== STATUS.CONCLUIDO &&
      !isPreTriagem(t),
  );
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const t of mine) {
    if (atrasada(t) && !args.isResolved(t.id, 'atrasadas')) n++;
    if (t.prazo === today && !atrasada(t) && !args.isResolved(t.id, 'hoje')) n++;
    if (t.status === 'bloqueado' && !args.isResolved(t.id, 'bloqueadas')) n++;
    if (
      (!Number(t.esforco) || t.esforco <= 0) &&
      (STAGE_RANK[t.subetapa] ?? 0) >= TRIAGE_RANK_GATE &&
      !args.isResolved(t.id, 'sem_esforco')
    ) {
      n++;
    }
    if (
      t.status === 'andamento' &&
      (!Number(t.tempoRealHoras) || Number(t.tempoRealHoras) <= 0) &&
      !args.isResolved(t.id, 'sem_horas')
    ) {
      n++;
    }
    // sem_comment não entra (precisa query async)
  }
  return n;
}
