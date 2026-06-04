'use client';

/**
 * Meu Foco — A.18 (redesign 2026-06-05)
 *
 * 6 seções colapsáveis derivadas de critérios independentes (tasks
 * podem aparecer em mais de uma — só Atrasadas vs Pra hoje são
 * naturalmente exclusivas). Card "Seu dia" no topo com narrativa e
 * counts. Pill P0/P1 filtra dentro de cada seção. Checkbox local
 * marca como "Resolvido HOJE" (não persiste em DB; zera virando o dia).
 *
 * Inline-edit por seção segue o padrão da Triagem: campos editáveis
 * só persistem ao clicar Salvar, fila estável durante edição.
 */

import { useCallback, useMemo, useState } from 'react';
import { useData, usePessoasById, useClientesById, useProjetosById } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
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
import { STATUS, STAGE_RANK, SUB_LABELS } from '@/lib/task-constants';
import {
  getBusinessDayCutoff,
  useLastCommentByTask,
} from '@/lib/use-last-comment';
import { useFocoDone, type FocoContexto } from '@/lib/use-foco-done';
import type { Task } from '@/lib/types';

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Cutoff para "sem comment" — milissegundos de 24h atrás (ou último
// dia útil pra evitar pressão em segunda).
const SEM_COMMENT_HOURS = 24;

type ContextoMeta = {
  key: FocoContexto;
  title: string;
  emptyMsg: string;
  defaultOpen: boolean;
};

// Todas defaultOpen=true · usuário colapsa se quiser.
const CONTEXTOS: ContextoMeta[] = [
  { key: 'atrasadas', title: 'Atrasadas', emptyMsg: 'Nada atrasado.', defaultOpen: true },
  { key: 'hoje', title: 'Pra hoje', emptyMsg: 'Nada com prazo hoje.', defaultOpen: true },
  { key: 'bloqueadas', title: 'Bloqueadas', emptyMsg: 'Sem represas.', defaultOpen: true },
  { key: 'sem_comment', title: 'Sem comentário (24h)', emptyMsg: 'Todas comentadas recentemente.', defaultOpen: true },
  { key: 'sem_esforco', title: 'Sem esforço', emptyMsg: 'Todas com esforço definido.', defaultOpen: true },
  { key: 'sem_horas', title: 'Sem horas realizadas', emptyMsg: 'Todas as andamento têm horas.', defaultOpen: true },
];

export function FocoClient() {
  const { tasks, loading, error, currentPessoa, viewerRole } = useData();
  const isCliente = viewerRole === 'cliente';
  const { openEdit } = useTaskModal();
  const pessoasById = usePessoasById();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const focusPessoaId = currentPessoa?.id ?? '';

  const [pillPrio, setPillPrio] = useState(false);
  const [openSet, setOpenSet] = useState<Set<FocoContexto>>(
    () => new Set(CONTEXTOS.filter((c) => c.defaultOpen).map((c) => c.key)),
  );
  const toggleSection = useCallback((k: FocoContexto) => {
    setOpenSet((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const { isResolved, toggle: toggleResolved } = useFocoDone();

  // ===== minhas tasks ativas =====
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

  // ===== ids p/ query de comments do próprio dono =====
  const andamentoIds = useMemo(
    () => mine.filter((t) => t.status === 'andamento').map((t) => t.id),
    [mine],
  );
  const { lastCommentMap } = useLastCommentByTask(andamentoIds, focusPessoaId || null);

  // ===== 6 listas independentes (sem dedup entre si) =====
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
        return la - lb; // mais antigos primeiro
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

  // Pill P0/P1 filtra dentro de cada seção (AND).
  const filterPrio = useCallback(
    (arr: Task[]) =>
      pillPrio ? arr.filter((t) => t.prioridade === 'P0' || t.prioridade === 'P1') : arr,
    [pillPrio],
  );

  // Counts (após pill, antes de resolver) e total pendente p/ narrativa.
  const counts = useMemo(() => {
    const c: Record<FocoContexto, number> = {
      atrasadas: 0,
      hoje: 0,
      bloqueadas: 0,
      sem_comment: 0,
      sem_esforco: 0,
      sem_horas: 0,
    };
    for (const ctx of CONTEXTOS) {
      c[ctx.key] = filterPrio(groups[ctx.key]).length;
    }
    return c;
  }, [groups, filterPrio]);

  // Counts pendentes (descontando resolvidos) — usados na narrativa
  // e nos chips de count da pill colapsável.
  const pending = useMemo(() => {
    const c: Record<FocoContexto, number> = {
      atrasadas: 0,
      hoje: 0,
      bloqueadas: 0,
      sem_comment: 0,
      sem_esforco: 0,
      sem_horas: 0,
    };
    for (const ctx of CONTEXTOS) {
      let n = 0;
      for (const t of filterPrio(groups[ctx.key])) {
        if (!isResolved(t.id, ctx.key)) n++;
      }
      c[ctx.key] = n;
    }
    return c;
  }, [groups, filterPrio, isResolved]);

  const totalPending =
    pending.atrasadas + pending.hoje + pending.bloqueadas +
    pending.sem_comment + pending.sem_esforco + pending.sem_horas;

  // Narrativa "seu dia"
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
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
      {/* Desktop · header com pill P0/P1 no slot direito (padrão Triagem) */}
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
              <button
                type="button"
                className={cn('triage-filter-chip', pillPrio && 'is-on')}
                onClick={() => setPillPrio((v) => !v)}
                title="Filtrar só prioridades P0/P1 em todas as seções"
              >
                <strong>P0/P1</strong>
              </button>
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

      {/* Mobile · título compacto */}
      {hasFocus && (
        <div className="md:hidden">
          <div className="m-pagetitle">
            <h1>Foco de <em>hoje</em></h1>
            <div className="narr">
              <b>{totalPending}</b> pendente{totalPending !== 1 ? 's' : ''}
              {pillPrio && <span className="sep">·</span>}
              {pillPrio && <b>filtro P0/P1</b>}
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <button
              type="button"
              className={cn('triage-filter-chip', pillPrio && 'is-on')}
              onClick={() => setPillPrio((v) => !v)}
              title="Filtrar só prioridades P0/P1 em todas as seções"
            >
              <strong>P0/P1</strong>
            </button>
          </div>
        </div>
      )}

      {/* 6 seções colapsáveis · desktop + mobile */}
      {hasFocus && (
        <div className="space-y-4">
          {/* Seu dia · narrativa + counts */}
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

          {/* 6 seções (pill P0/P1 já no header) */}
          {CONTEXTOS.map((ctx) => {
            const items = filterPrio(groups[ctx.key]);
            const open = openSet.has(ctx.key);
            const pendingN = pending[ctx.key];
            return (
              <FocoSection
                key={ctx.key}
                meta={ctx}
                items={items}
                pending={pendingN}
                total={counts[ctx.key]}
                open={open}
                onToggle={() => toggleSection(ctx.key)}
                isResolved={(id) => isResolved(id, ctx.key)}
                onToggleResolved={(id) => toggleResolved(id, ctx.key)}
                lastCommentMap={lastCommentMap}
                clientesById={clientesById}
                projetosById={projetosById}
                openEdit={openEdit}
              />
            );
          })}

        </div>
      )}
    </div>
  );
}

// =========================================================================
//  Seção colapsável
// =========================================================================
function FocoSection({
  meta,
  items,
  pending,
  total,
  open,
  onToggle,
  isResolved,
  onToggleResolved,
  lastCommentMap,
  clientesById,
  projetosById,
  openEdit,
}: {
  meta: ContextoMeta;
  items: Task[];
  pending: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  isResolved: (id: string) => boolean;
  onToggleResolved: (id: string) => void;
  lastCommentMap: Map<string, Date>;
  clientesById: ReturnType<typeof useClientesById>;
  projetosById: ReturnType<typeof useProjetosById>;
  openEdit: (id: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex items-center justify-between w-full mb-2 px-1 text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 font-brand font-semibold text-sm">
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} className="text-muted" />
          <span>{meta.title}</span>
          {pending > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[18px] h-4 rounded-full text-[9px] font-bold text-white px-1.5"
              style={{ background: 'var(--danger)' }}
              title={`${pending} pendente${pending > 1 ? 's' : ''}`}
            >
              {pending}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">
          {total === 0 ? '—' : total === 1 ? '1 task' : `${total} tasks`}
        </span>
      </button>

      {open && (
        <>
          {items.length === 0 ? (
            <div className="card text-center py-4 px-3 text-muted text-xs italic">
              {meta.emptyMsg}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((t) => (
                <FocoTaskRow
                  key={t.id}
                  task={t}
                  contexto={meta.key}
                  resolved={isResolved(t.id)}
                  onToggleResolved={() => onToggleResolved(t.id)}
                  lastComment={lastCommentMap.get(t.id) ?? null}
                  clienteName={clientesById.get(t.clienteId)?.nome ?? '—'}
                  projetoName={projetosById.get(t.projetoId)?.nome ?? '—'}
                  openEdit={openEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =========================================================================
//  Linha · card · info + botão Resolver (sem inline edit)
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
}: {
  task: Task;
  contexto: FocoContexto;
  resolved: boolean;
  onToggleResolved: () => void;
  lastComment: Date | null;
  clienteName: string;
  projetoName: string;
  openEdit: (id: string) => void;
}) {
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
      className={cn('card p-3 md:p-4 transition-colors', resolved && 'opacity-50')}
      onClick={() => openEdit(task.id)}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex items-start gap-3">
        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Linha 1 · prio + flags + título */}
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className={`pri pri-${task.prioridade}`}>
              <span className="pri-dot" />
              {task.prioridade}
            </span>
            {task.privada && (
              <span className="ia-chip ia-chip-mini" title="Task privada">🔒</span>
            )}
            {task.criadoPorIa && (
              <span className="ia-chip ia-chip-mini" title="Criada por automação IA">🤖 IA</span>
            )}
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

        {/* Botão Resolver · stopPropagation pra não abrir o modal */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleResolved(); }}
          className={cn(
            'btn text-xs flex items-center gap-1 shrink-0',
            resolved ? 'btn-primary' : 'btn-ghost',
          )}
          title={resolved ? 'Desmarcar resolvido hoje' : 'Marcar como resolvido (só hoje · não persiste)'}
        >
          <Icon name="check" size={13} />
          {resolved ? 'Resolvido' : 'Resolver'}
        </button>
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


/** Hook helper exportado pra computar count do Foco no header.
 *  Não precisa de DB (skip sem_comment) — só usa as 5 contextos
 *  imediatamente computáveis. Match com o que aparece como bolinha. */
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
    // atrasadas
    if (atrasada(t) && !args.isResolved(t.id, 'atrasadas')) n++;
    // hoje
    if (t.prazo === today && !atrasada(t) && !args.isResolved(t.id, 'hoje')) n++;
    // bloqueadas
    if (t.status === 'bloqueado' && !args.isResolved(t.id, 'bloqueadas')) n++;
    // sem esforco
    if (
      (!Number(t.esforco) || t.esforco <= 0) &&
      (STAGE_RANK[t.subetapa] ?? 0) >= TRIAGE_RANK_GATE &&
      !args.isResolved(t.id, 'sem_esforco')
    ) {
      n++;
    }
    // sem horas
    if (
      t.status === 'andamento' &&
      (!Number(t.tempoRealHoras) || Number(t.tempoRealHoras) <= 0) &&
      !args.isResolved(t.id, 'sem_horas')
    ) {
      n++;
    }
    // sem_comment NÃO entra (precisa query async)
  }
  return n;
}
