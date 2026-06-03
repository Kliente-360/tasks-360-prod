'use client';

/**
 * Kanban — Onda 0 · Bloco 2.4
 *
 * Duas visões:
 *   - Operacional: 11 colunas (SUBS_FLAT) com DnD entre colunas;
 *     mover dispara setTaskSubetapa (UPDATE optimistic + history log
 *     se o macro mudar).
 *   - Executiva: 4 colunas macro (backlog/andamento/bloqueado/concluido)
 *     read-only — mostra a subetapa abaixo do título do card mas não
 *     aceita drop (mover macro perderia informação da subetapa).
 *
 * Mobile força executiva (op com 11 colunas é ruim em viewport estreito).
 * Filtros (cliente/projeto encadeado/pessoa) compartilham o sentinel
 * '__empty__' com o Backlog.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useData,
  useClientesById,
  useProjetosById,
  usePessoasById,
  useProjetosByCliente,
} from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { Icon } from '@/components/icons';
import { PriChip, TaskAvatar, PrazoLabel, TagIA } from '@/components/task-card/primitives';
import { createClient } from '@/lib/supabase/client';
import { agingDays, agingLevel, atrasada, fmtDateShort, fmtTempoEtapa, isPreTriagem, lblStatus, matchesPrazoFilter, needsTriage, triageFailures, type PrazoFilter } from '@/lib/task-utils';
import { SUB_LABELS, SUBS_FLAT, SUB_TO_MACRO } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import type { Filters as StdFilters } from '@/lib/filters';
import type { Task } from '@/lib/types';

const EMPTY = '__empty__';
const MACROS = ['backlog', 'andamento', 'bloqueado', 'concluido'] as const;

export function KanbanClient() {
  const { tasks, patchTask, replaceTask, loading, error } = useData();
  const { openEdit } = useTaskModal();
  const toast = useToast();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const projetosByCliente = useProjetosByCliente();

  const { clientes, pessoas, projetos } = useData();
  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const pessoasNaoCliente = useMemo(() => pessoas.filter((p) => p.role !== 'cliente'), [pessoas]);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // ===== State =====
  const [filters, setFilters] = useState<{
    cliente: string;
    projeto: string;
    pessoa: string;
    prazo: PrazoFilter;
  }>(() => {
    const s = getSharedFilters();
    // Kanban's PrazoFilter agora cobre todos os valores do shared
    // (atrasadas, hoje, semana, sem) + d7/d15/mes extras.
    const sharedPrazo: PrazoFilter =
      s.prazo === 'atrasadas' || s.prazo === 'semana' || s.prazo === 'hoje' || s.prazo === 'sem'
        ? s.prazo
        : '';
    return {
      cliente: s.cliente,
      projeto: s.projeto,
      pessoa: s.pessoa,
      prazo: sharedPrazo,
    };
  });
  useEffect(() => {
    // Só propaga prazo se for um valor que o shared store entende.
    const prazoForShare =
      filters.prazo === 'atrasadas' || filters.prazo === 'semana' ||
      filters.prazo === 'hoje' || filters.prazo === 'sem'
        ? filters.prazo
        : '';
    patchSharedFilters({
      cliente: filters.cliente,
      projeto: filters.projeto,
      pessoa: filters.pessoa,
      prazo: prazoForShare,
    });
  }, [filters.cliente, filters.projeto, filters.pessoa, filters.prazo]);
  const [qDraft, setQDraft] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [onlyIA, setOnlyIA] = useState(false);
  const [onlyHumano, setOnlyHumano] = useState(false);
  const [kanbanView, setKanbanView] = useState<'op' | 'exec'>('op');

  // g+l global → limpa filtros.
  useEffect(() => {
    const handler = () => {
      setFilters({ cliente: '', projeto: '', pessoa: '', prazo: '' });
      setQDraft('');
      clearSharedFilters();
    };
    window.addEventListener(CLEAR_FILTERS_EVENT, handler);
    return () => window.removeEventListener(CLEAR_FILTERS_EVENT, handler);
  }, []);

  // Mobile: Kanban não aparece (decisão de produto, igual hideMobile: true do
  // tabsList Alpine). Quem acessa /kanban via URL no mobile é redirecionado
  // pra /backlog, que é a alternativa adequada em viewport estreito.
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => {
      const m = mq.matches;
      setIsMobile(m);
      if (m) router.replace('/backlog');
    };
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [router]);

  // DnD state
  const [draggingId, setDraggingId] = useState<string>('');
  const [dragOverCol, setDragOverCol] = useState<string>('');

  const projetosFiltrados = useMemo(() => {
    if (!filters.cliente || filters.cliente === EMPTY) {
      return projetos.filter((p) => !p.arquivadoEm);
    }
    return (projetosByCliente.get(filters.cliente) ?? []).filter((p) => !p.arquivadoEm);
  }, [filters.cliente, projetos, projetosByCliente]);

  // ===== Filtragem =====
  const visibleTasks = useMemo(() => {
    const q = qDraft.trim().toLowerCase();
    return tasks.filter((t) => {
      // Gate A.4: IA pre-triagem fica fora do Kanban
      if (isPreTriagem(t)) return false;
      if (!showArchived && t.arquivadoEm) return false;
      if (showArchived && !t.arquivadoEm && false) return false; // noop pra simetria
      if (filters.cliente === EMPTY) {
        if (t.clienteId) return false;
      } else if (filters.cliente && t.clienteId !== filters.cliente) return false;
      if (filters.projeto === EMPTY) {
        if (t.projetoId) return false;
      } else if (filters.projeto && t.projetoId !== filters.projeto) return false;
      if (filters.pessoa === EMPTY) {
        if (t.pessoaId) return false;
      } else if (filters.pessoa && t.pessoaId !== filters.pessoa) return false;
      if (filters.prazo && !matchesPrazoFilter(t, filters.prazo)) return false;
      if (onlyIA && !t.criadoPorIa) return false;
      if (onlyHumano && t.criadoPorIa) return false;
      if (q) {
        const cli = clientesById.get(t.clienteId)?.nome ?? '';
        const proj = projetosById.get(t.projetoId)?.nome ?? '';
        const pess = pessoasById.get(t.pessoaId)?.nome ?? '';
        const hay = [
          t.titulo, cli, proj, pess, t.descricao ?? '',
          t.prioridade, t.status, t.subetapa,
          (t.tags ?? []).join(' '),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filters, qDraft, showArchived, onlyIA, onlyHumano, clientesById, projetosById, pessoasById]);

  // ===== Buckets por coluna =====
  const tasksBySub = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      let arr = m.get(t.subetapa);
      if (!arr) {
        arr = [];
        m.set(t.subetapa, arr);
      }
      arr.push(t);
    }
    // Ordem dentro da coluna: mais recente nesta etapa primeiro.
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.subetapaEm || b.statusEm || b.criadoEm || 0) - (a.subetapaEm || a.statusEm || a.criadoEm || 0));
    }
    return m;
  }, [visibleTasks]);

  const tasksByMacro = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      let arr = m.get(t.status);
      if (!arr) {
        arr = [];
        m.set(t.status, arr);
      }
      arr.push(t);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.statusEm || b.criadoEm || 0) - (a.statusEm || a.criadoEm || 0));
    }
    return m;
  }, [visibleTasks]);

  // ===== Move task entre colunas (op view) =====
  const setTaskSubetapa = useCallback(
    async (t: Task, newSub: string) => {
      if (!t || t.subetapa === newSub) return;
      const newMacro = SUB_TO_MACRO[newSub] ?? t.status;
      const macroChanged = t.status !== newMacro;
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const prev = patchTask(t.id, {
        subetapa: newSub,
        status: newMacro as Task['status'],
        subetapaEm: nowMs,
        statusEm: macroChanged ? nowMs : t.statusEm,
      });
      if (!prev) return;

      const payload: Record<string, unknown> = { subetapa: newSub, subetapa_em: nowIso };
      if (macroChanged) payload.status_em = nowIso;
      const { error } = await sb.from('tasks').update(payload).eq('id', t.id);
      if (error) {
        replaceTask(t.id, prev);
        toast.error('Erro ao mover: ' + error.message);
        return;
      }
      if (macroChanged) {
        sb.from('task_field_history').insert({
          task_id: t.id,
          field: 'status',
          from_value: prev.status,
          to_value: newMacro,
          actor_pessoa_id: null,
          actor_source: 'app',
          occurred_at: nowIso,
        });
      }
    },
    [patchTask, replaceTask, sb, toast],
  );

  // ===== DnD handlers =====
  const onDragStart = (e: React.DragEvent, t: Task) => {
    setDraggingId(t.id);
    e.dataTransfer.setData('text/plain', t.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropSub = useCallback(
    async (e: React.DragEvent, sub: string) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || draggingId;
      setDragOverCol('');
      setDraggingId('');
      if (!id) return;
      const t = visibleTasks.find((x) => x.id === id) ?? tasks.find((x) => x.id === id);
      if (t) await setTaskSubetapa(t, sub);
    },
    [draggingId, visibleTasks, tasks, setTaskSubetapa],
  );

  // ===== Render helpers =====
  const tempoNaSubetapa = (t: Task): string => fmtTempoEtapa(t.subetapaEm || t.statusEm);

  // Mobile cai aqui só por uma fração antes do router.replace executar —
  // não renderiza nada pra evitar flash do layout op com 11 colunas.
  if (isMobile) return null;
  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  return (
    <div>
      {/* Desktop · PageHeader + toggle Macro/Op no titleAside + FilterBar */}
      <div className="hidden md:block">
        <PageHeader
          title="Kanban"
          right={
            <FilterBar
              leftSlot={
                <div className="view-toggle view-toggle-icons" role="tablist" aria-label="Visão do kanban">
                  <button
                    type="button"
                    className={kanbanView === 'op' ? 'active' : ''}
                    onClick={() => setKanbanView('op')}
                    title="Operacional — colunas detalhadas (11 colunas)"
                    aria-label="Visão operacional"
                  >
                    <Icon name="columns" size={15} />
                  </button>
                  <button
                    type="button"
                    className={kanbanView === 'exec' ? 'active' : ''}
                    onClick={() => setKanbanView('exec')}
                    title="Executiva — colunas macro (4 colunas)"
                    aria-label="Visão executiva"
                  >
                    <Icon name="square" size={15} />
                  </button>
                </div>
              }
              f={{
                q: qDraft,
                cliente: filters.cliente,
                projeto: filters.projeto,
                resp: filters.pessoa,
                prazo: filters.prazo as StdFilters['prazo'],
              } satisfies StdFilters}
              set={(key, value) => {
                if (key === 'q') setQDraft(value);
                else if (key === 'cliente') setFilters({ ...filters, cliente: value, projeto: value ? filters.projeto : '' });
                else if (key === 'projeto') setFilters({ ...filters, projeto: value });
                else if (key === 'resp') setFilters({ ...filters, pessoa: value });
                else if (key === 'prazo') setFilters({ ...filters, prazo: value as PrazoFilter });
              }}
              onClear={() => {
                setQDraft('');
                setFilters({ cliente: '', projeto: '', pessoa: '', prazo: '' });
                setShowArchived(false);
                setOnlyIA(false);
                setOnlyHumano(false);
                clearSharedFilters();
              }}
              clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
              projetoOptions={projetosFiltrados.map((p) => ({ v: p.id, label: p.nome }))}
              pessoaOptions={pessoasNaoCliente.map((p) => ({ v: p.id, label: p.nome }))}
              moreItems={[
                { key: 'group-resp', label: 'Agrupar: Responsável', enabled: false, kind: 'action', icon: 'users' },
                { key: 'group-cli', label: 'Agrupar: Cliente', enabled: false, kind: 'action', icon: 'building' },
                { key: 'group-status', label: 'Agrupar: Status', enabled: false, kind: 'action', icon: 'list-filter' },
                { key: 'div1', label: '---' },
                { key: 'arquivadas', label: 'Mostrar arquivadas', kind: 'toggle', active: showArchived, onClick: () => setShowArchived((v) => !v) },
                { key: 'ia', label: 'Somente criadas por IA', kind: 'toggle', active: onlyIA, onClick: () => { setOnlyIA((v) => !v); setOnlyHumano(false); } },
                { key: 'humano', label: 'Somente criadas por humanos', kind: 'toggle', active: onlyHumano, onClick: () => { setOnlyHumano((v) => !v); setOnlyIA(false); } },
              ] satisfies MoreMenuItem[]}
            />
          }
        />
      </div>

      {/* Visão OPERACIONAL */}
      {kanbanView === 'op' && (
        <div className="kanban-scroll-op">
          {SUBS_FLAT.map((sub) => {
            const colTasks = tasksBySub.get(sub) ?? [];
            const macro = SUB_TO_MACRO[sub] ?? 'backlog';
            return (
              <div
                key={sub}
                className={`kcol kcol-op ${dragOverCol === sub ? 'drop-target' : ''}`}
                data-m={macro}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(sub);
                }}
                onDragLeave={() => dragOverCol === sub && setDragOverCol('')}
                onDrop={(e) => onDropSub(e, sub)}
              >
                <div className="mb-3 px-1">
                  <div className="kcol-op-crumb">{lblStatus(macro)}</div>
                  <div className="kcol-op-name">{SUB_LABELS[sub] ?? sub}</div>
                  {colTasks.length > 0 && (
                    <div className="font-mono text-xs text-muted mt-1.5">
                      {colTasks.length} itens · {colTasks.reduce((a, b) => a + (+b.esforco || 0), 0)}h
                    </div>
                  )}
                </div>
                {colTasks.map((t) => (
                  <KCard
                    key={t.id}
                    t={t}
                    dragging={draggingId === t.id}
                    onDragStart={(e) => onDragStart(e, t)}
                    onDragEnd={() => {
                      setDraggingId('');
                      setDragOverCol('');
                    }}
                    onClick={() => openEdit(t.id)}
                    clienteName={clientesById.get(t.clienteId)?.nome ?? '—'}
                    projetoName={projetosById.get(t.projetoId)?.nome ?? '—'}
                    pessoaName={pessoasById.get(t.pessoaId)?.nome ?? '—'}
                    extraFooter={
                      <div className="text-[10px] text-muted">
                        {tempoNaSubetapa(t)} nesta etapa
                      </div>
                    }
                    draggable
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-center text-muted text-xs py-8">—</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Visão EXECUTIVA */}
      {kanbanView === 'exec' && (
        <div className="kanban-scroll">
          {MACROS.map((col) => {
            const colTasks = tasksByMacro.get(col) ?? [];
            return (
              <div key={col} className="kcol kcol-exec kcol-readonly" data-m={col}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">
                      {lblStatus(col)}
                    </div>
                    <div className="font-mono text-xs text-muted mt-1">
                      {colTasks.length} itens · {colTasks.reduce((a, b) => a + (+b.esforco || 0), 0)}h
                    </div>
                  </div>
                </div>
                {colTasks.map((t) => (
                  <KCard
                    key={t.id}
                    t={t}
                    onClick={() => openEdit(t.id)}
                    clienteName={clientesById.get(t.clienteId)?.nome ?? '—'}
                    projetoName={projetosById.get(t.projetoId)?.nome ?? '—'}
                    pessoaName={pessoasById.get(t.pessoaId)?.nome ?? '—'}
                    showSubetapa
                    extraFooter={
                      <div className="text-[10px] text-muted">
                        {tempoNaSubetapa(t)} nesta etapa
                      </div>
                    }
                  />
                ))}
                {colTasks.length === 0 && (
                  <div className="text-center text-muted text-xs py-8">—</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// KCard — card compartilhado entre Op e Exec.
// Layout matches o .kcard do Backlog mobile + Calendário.
// ============================================================
function KCard({
  t,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
  clienteName,
  projetoName,
  pessoaName,
  showSubetapa,
  extraFooter,
  draggable,
}: {
  t: Task;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onClick: () => void;
  clienteName: string;
  projetoName: string;
  pessoaName: string;
  showSubetapa?: boolean;
  extraFooter?: React.ReactNode;
  draggable?: boolean;
}) {
  const lvl = agingLevel(t);
  return (
    <div
      className={`kcard ${dragging ? 'dragging' : ''}`}
      draggable={!!draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="font-medium text-sm leading-snug mb-2 flex items-start gap-1.5">
        {t.privada && (
          <span className="ia-chip ia-chip-mini" title="Task privada">🔒</span>
        )}
        {t.criadoPorIa && <TagIA />}
        <span>{t.titulo}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs text-muted truncate">{clienteName + ' · ' + projetoName}</div>
        <PriChip prio={t.prioridade} />
      </div>
      {showSubetapa && (
        <div className="text-[11px] text-ink-soft font-mono mb-2">{SUB_LABELS[t.subetapa] ?? t.subetapa}</div>
      )}
      {t.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {t.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          <TaskAvatar name={pessoaName} title={pessoaName} />
          <span className="text-ink-soft truncate">{pessoaName.split(/\s+/)[0] ?? pessoaName}</span>
        </span>
        <PrazoLabel task={t} />
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {extraFooter}
        {lvl !== 'fresh' && (
          <span
            className={`aging-badge aging-${lvl}`}
            title={`parada há ${agingDays(t)} dias`}
          >
            {agingDays(t)}d
          </span>
        )}
        {needsTriage(t) && (
          <span className="triage-badge" title={triageFailures(t).join(' · ')}>
            triar
          </span>
        )}
      </div>
    </div>
  );
}

