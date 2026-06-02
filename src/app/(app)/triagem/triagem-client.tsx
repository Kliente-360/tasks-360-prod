'use client';

/**
 * Triagem — Onda 0 · Bloco 2.5
 *
 * Lista de tasks que precisam de triagem (sem responsável/cliente/prazo/
 * esforço conforme STAGE_RANK). Filtros chip-toggle (sem resp / sem prazo
 * / sem esforço / origem IA). Bulk: responsável, prazo, esforço.
 *
 * Reusa:
 *   - triageFailures (lib/task-utils)
 *   - useData() + useTaskModal()
 *   - .triage-chip / .triage-filter-chip (já em globals.css)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useData, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { BulkBar, BulkBarClearButton, BulkBarSep } from '@/components/bulk-bar';
import { PageHeader } from '@/components/page-header';
import { PillsFilter } from '@/components/pills-filter';
import { PriChip, PrazoLabel, TagIA } from '@/components/task-card/primitives';
import { createClient } from '@/lib/supabase/client';
import { agingDays, atrasada, fmtDateShort, triageFailures } from '@/lib/task-utils';
import { STATUS, SUB_LABELS } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import type { Task } from '@/lib/types';

const NONE = '__none__';

type TriagemFilter = {
  semResp: boolean;
  semPrazo: boolean;
  semEsforco: boolean;
  origem: '' | 'ia' | 'humano';
};

type BulkPending = {
  pessoa: string;
  prazo: string;
  esforco: string;
  prioridade: string;
};

const DEFAULT_FILTER: TriagemFilter = {
  semResp: false,
  semPrazo: false,
  semEsforco: false,
  origem: '',
};

const DEFAULT_BULK: BulkPending = { pessoa: '', prazo: '', esforco: '', prioridade: '' };

type TaskWithFailures = Task & { _failures: string[]; _failCount: number };

export function TriagemClient() {
  const { tasks, pessoas, patchTasks, loading, error } = useData();
  const { openEdit } = useTaskModal();
  const toast = useToast();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const [filter, setFilter] = useState<TriagemFilter>(DEFAULT_FILTER);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState<BulkPending>(DEFAULT_BULK);

  // g+l global → limpa os 4 chips de filtro.
  useEffect(() => {
    const handler = () => setFilter(DEFAULT_FILTER);
    window.addEventListener(CLEAR_FILTERS_EVENT, handler);
    return () => window.removeEventListener(CLEAR_FILTERS_EVENT, handler);
  }, []);

  // Mobile: Triagem não aparece (decisão de produto). Quem acessa /triagem
  // por URL no mobile é redirecionado pra /backlog. UI bate com hideMobile
  // no NavItem (dropdown filtra esta tab fora).
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

  const pessoasNaoCliente = useMemo(
    () => pessoas.filter((p) => p.role !== 'cliente'),
    [pessoas],
  );

  // ===== triagemTasks: visíveis não-concluídas com falhas, ordenadas =====
  const triagemTasks = useMemo<TaskWithFailures[]>(() => {
    const out: TaskWithFailures[] = [];
    for (const t of tasks) {
      if (t.arquivadoEm) continue;
      if (t.status === STATUS.CONCLUIDO) continue;
      const failures = triageFailures(t);
      if (!failures.length) continue;
      out.push({ ...t, _failures: failures, _failCount: failures.length });
    }
    out.sort((a, b) => b._failCount - a._failCount || (a.criadoEm || 0) - (b.criadoEm || 0));
    return out;
  }, [tasks]);

  // Aplica filtro arbitrário (não-state) — usado tanto pelo `filtered` real
  // quanto pelos previews de count "se eu ligar esse chip mantendo os outros".
  const applyFilter = useCallback(
    (arr: TaskWithFailures[], f: TriagemFilter) =>
      arr.filter((t) => {
        if (f.semResp && !t._failures.includes('sem responsável')) return false;
        if (f.semPrazo && !t._failures.includes('sem prazo')) return false;
        if (f.semEsforco && !t._failures.includes('sem esforço')) return false;
        if (f.origem === 'ia' && !t.criadoPorIa) return false;
        if (f.origem === 'humano' && t.criadoPorIa) return false;
        return true;
      }),
    [],
  );

  const filtered = useMemo(
    () => applyFilter(triagemTasks, filter),
    [triagemTasks, filter, applyFilter],
  );

  const anyFilter = filter.semResp || filter.semPrazo || filter.semEsforco || !!filter.origem;

  // Counts dinâmicos: quantas tasks sobrariam SE esse chip estivesse ativo,
  // mantendo os outros filtros. Padrão "filtros responsivos" — você vê o
  // impacto antes de clicar. Chip já ativo mostra o count atual do recorte.
  const counts = useMemo(
    () => ({
      semResp: applyFilter(triagemTasks, { ...filter, semResp: true }).length,
      semPrazo: applyFilter(triagemTasks, { ...filter, semPrazo: true }).length,
      semEsforco: applyFilter(triagemTasks, { ...filter, semEsforco: true }).length,
      ia: applyFilter(triagemTasks, { ...filter, origem: 'ia' }).length,
    }),
    [triagemTasks, filter, applyFilter],
  );

  // ===== Bulk =====
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setBulkPending(DEFAULT_BULK);
  }, []);

  const bulkSave = useCallback(async () => {
    const p = bulkPending;
    const ids = [...selectedIds];
    if (!ids.length) return;
    const updates: Record<string, unknown> = {};
    const localPatch: Partial<Task> = {};
    if (p.pessoa) {
      updates.pessoa_id = p.pessoa === NONE ? null : p.pessoa;
      localPatch.pessoaId = p.pessoa === NONE ? '' : p.pessoa;
    }
    if (p.prazo) {
      updates.prazo = p.prazo;
      localPatch.prazo = p.prazo;
    }
    if (p.esforco !== '') {
      const num = Number(p.esforco);
      if (!(num >= 0)) {
        toast.error('Esforço inválido.');
        return;
      }
      updates.esforco = num;
      localPatch.esforco = num;
    }
    if (p.prioridade) {
      updates.prioridade = p.prioridade;
      localPatch.prioridade = p.prioridade as Task['prioridade'];
    }
    if (Object.keys(updates).length === 0) return;
    const { error } = await sb.from('tasks').update(updates).in('id', ids);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    patchTasks(ids, localPatch);
    setBulkPending(DEFAULT_BULK);
  }, [bulkPending, selectedIds, sb, patchTasks, toast]);

  // Mobile cai aqui só por uma fração antes do router.replace executar.
  if (isMobile) return null;
  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Desktop · PageHeader + chips filtros (mantém comportamento existente, visual novo) */}
      {triagemTasks.length > 0 && (
        <div className="hidden md:block">
          <PageHeader
            title="Triagem"
            right={
              <div className="flex items-center gap-2 flex-wrap">
                <FilterChip
                  active={filter.semResp}
                  onClick={() => setFilter({ ...filter, semResp: !filter.semResp })}
                  count={counts.semResp}
                  label="sem resp."
                />
                <FilterChip
                  active={filter.semPrazo}
                  onClick={() => setFilter({ ...filter, semPrazo: !filter.semPrazo })}
                  count={counts.semPrazo}
                  label="sem prazo"
                />
                <FilterChip
                  active={filter.semEsforco}
                  onClick={() => setFilter({ ...filter, semEsforco: !filter.semEsforco })}
                  count={counts.semEsforco}
                  label="sem esforço"
                />
                <FilterChip
                  active={filter.origem === 'ia'}
                  onClick={() => setFilter({ ...filter, origem: filter.origem === 'ia' ? '' : 'ia' })}
                  count={counts.ia}
                  label="criadas por IA"
                  title="Filtra só tasks criadas por automação IA (Cowork etc)."
                />
              </div>
            }
          />
        </div>
      )}

      {/* Mobile chips */}
      {triagemTasks.length > 0 && (
        <div className="flex items-center gap-1.5 md:hidden flex-wrap">
          <FilterChip
            active={filter.semResp}
            onClick={() => setFilter({ ...filter, semResp: !filter.semResp })}
            count={counts.semResp}
            label="sem resp."
            mobile
          />
          <FilterChip
            active={filter.semPrazo}
            onClick={() => setFilter({ ...filter, semPrazo: !filter.semPrazo })}
            count={counts.semPrazo}
            label="sem prazo"
            mobile
          />
          <FilterChip
            active={filter.semEsforco}
            onClick={() => setFilter({ ...filter, semEsforco: !filter.semEsforco })}
            count={counts.semEsforco}
            label="sem esforço"
            mobile
          />
          <FilterChip
            active={filter.origem === 'ia'}
            onClick={() =>
              setFilter({ ...filter, origem: filter.origem === 'ia' ? '' : 'ia' })
            }
            count={counts.ia}
            label="🤖 IA"
            mobile
          />
        </div>
      )}

      {/* Empty states */}
      {triagemTasks.length === 0 && (
        <div className="card p-8 md:p-10 text-center">
          <div className="font-brand text-lg text-ink mb-2">Nenhuma tarefa em triagem</div>
          <div className="text-sm text-muted">
            Toda task tem responsável, cliente e — onde aplica — prazo e esforço.
          </div>
        </div>
      )}
      {triagemTasks.length > 0 && filtered.length === 0 && (
        <div className="card p-6 text-center text-sm text-muted italic">
          Nenhuma task casa com os filtros ativos.
        </div>
      )}

      {/* Cards */}
      {filtered.map((t) => {
        const sel = selectedIds.includes(t.id);
        return (
          <div
            key={t.id}
            className={`card p-3 md:p-5 cursor-pointer hover:border-line-strong transition-colors ${sel ? 'bg-brand-tint' : ''}`}
            onClick={() => openEdit(t.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={sel}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelect(t.id);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    {t.prioridade && <PriChip prio={t.prioridade} />}
                    {t.privada && (
                      <span className="ia-chip ia-chip-mini" title="Task privada">
                        🔒
                      </span>
                    )}
                    {t.criadoPorIa && <TagIA />}
                    <span className="font-medium text-ink break-words">{t.titulo}</span>
                  </div>
                  {/* Linha 2 (subetapa · criada há Xd) — fonte mono pra dar
                      o ritmo de metadata "etapa + idade". */}
                  <div className="text-xs text-muted font-mono break-words">
                    {SUB_LABELS[t.subetapa] ?? t.subetapa}
                    {t.criadoEm > 0 && (
                      <>
                        {' · criada há '}
                        {agingDays({ statusEm: t.criadoEm })}d
                      </>
                    )}
                  </div>
                  {/* Linha 3 (desktop): cliente · projeto · responsável · prazo.
                      Mobile fica resumido (só cliente · responsável) pra não
                      empilhar 3 linhas de texto. */}
                  <div className="hidden md:flex items-center gap-1.5 text-xs text-ink-soft mt-1 flex-wrap">
                    <span className={t.clienteId ? '' : 'italic text-muted'}>
                      {t.clienteId ? clientesById.get(t.clienteId)?.nome ?? '—' : 'sem cliente'}
                    </span>
                    <span className="text-muted">·</span>
                    <span className={t.projetoId ? '' : 'italic text-muted'}>
                      {t.projetoId ? projetosById.get(t.projetoId)?.nome ?? '—' : 'sem projeto'}
                    </span>
                    <span className="text-muted">·</span>
                    <span className={t.pessoaId ? '' : 'italic text-muted'}>
                      {t.pessoaId ? pessoasById.get(t.pessoaId)?.nome ?? '—' : 'sem responsável'}
                    </span>
                    <span className="text-muted">·</span>
                    {t.prazo ? <PrazoLabel task={t} /> : <span className="italic text-muted font-mono">sem prazo</span>}
                  </div>
                  <div className="md:hidden flex items-center gap-1.5 text-xs text-ink-soft mt-1 flex-wrap">
                    <span className={t.clienteId ? 'truncate' : 'italic text-muted'}>
                      {t.clienteId ? clientesById.get(t.clienteId)?.nome ?? '—' : 'sem cliente'}
                    </span>
                    <span className="text-muted">·</span>
                    <span className={t.pessoaId ? 'truncate' : 'italic text-muted'}>
                      {t.pessoaId ? pessoasById.get(t.pessoaId)?.nome ?? '—' : 'sem resp.'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="hidden md:flex flex-wrap gap-1 shrink-0 justify-end max-w-[55%]">
                {t._failures.map((f) => (
                  <span key={f} className="triage-chip">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2 pl-7 md:hidden">
              {t._failures.map((f) => (
                <span key={f} className="triage-chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      <BulkBar selectedCount={selectedIds.length} onClear={clearSelection}>
        <select
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[120px]"
          value={bulkPending.pessoa}
          onChange={(e) => setBulkPending({ ...bulkPending, pessoa: e.target.value })}
          title="Responsável"
        >
          <option value="">responsável…</option>
          <option value={NONE}>— nenhum —</option>
          {pessoasNaoCliente.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[110px]"
          value={bulkPending.prazo}
          onChange={(e) => setBulkPending({ ...bulkPending, prazo: e.target.value })}
          title="Prazo"
        />
        <input
          type="number"
          min={0}
          step={1}
          placeholder="esforço (h)"
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[110px]"
          value={bulkPending.esforco}
          onChange={(e) => setBulkPending({ ...bulkPending, esforco: e.target.value })}
          title="Esforço em horas"
        />
        <select
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[80px]"
          value={bulkPending.prioridade}
          onChange={(e) => setBulkPending({ ...bulkPending, prioridade: e.target.value })}
          title="Prioridade"
        >
          <option value="">pri…</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        <div className="flex gap-2 md:contents">
          <button
            type="button"
            className="btn btn-primary text-sm md:text-xs py-2 md:py-1.5 px-3 md:px-2 flex-1 md:flex-none justify-center"
            onClick={bulkSave}
            disabled={!(bulkPending.pessoa || bulkPending.prazo || bulkPending.esforco !== '' || bulkPending.prioridade)}
          >
            salvar
          </button>
          <BulkBarSep />
          <BulkBarClearButton onClick={clearSelection} />
        </div>
      </BulkBar>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  label,
  mobile,
  title,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
  mobile?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`triage-filter-chip ${active ? 'is-on' : ''} ${mobile ? 'flex-1 justify-center' : ''}`}
      onClick={onClick}
      title={title}
    >
      <strong>{count}</strong>&nbsp;{label}
    </button>
  );
}
