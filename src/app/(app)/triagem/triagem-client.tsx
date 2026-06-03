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
import { PageHeader } from '@/components/page-header';
import { PillsFilter } from '@/components/pills-filter';
import { PriChip, PrazoLabel, TagIA } from '@/components/task-card/primitives';
import { createClient } from '@/lib/supabase/client';
import { agingDays, atrasada, fmtDateShort, isPreTriagem, triageFailures, TRIAGE_RANK_GATE } from '@/lib/task-utils';
import { STATUS, SUB_LABELS, STAGE_RANK } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import type { Task, Pessoa, Cliente, Projeto } from '@/lib/types';
import { useClickAway } from '@/lib/use-click-away';

type TriagemFilter = {
  semCliente: boolean;
  semProjeto: boolean;
  semResp: boolean;
  semPrazo: boolean;
  semEsforco: boolean;
  origem: '' | 'ia' | 'humano';
};

const DEFAULT_FILTER: TriagemFilter = {
  semCliente: false,
  semProjeto: false,
  semResp: false,
  semPrazo: false,
  semEsforco: false,
  origem: '',
};

type TaskWithFailures = Task & { _failures: string[]; _failCount: number };

export function TriagemClient() {
  const { tasks, pessoas, clientes, projetos, patchTask, currentPessoa, loading, error } = useData();
  const { openEdit } = useTaskModal();
  const toast = useToast();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const [filter, setFilter] = useState<TriagemFilter>(DEFAULT_FILTER);

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

  // ===== triagemTasks: visíveis não-concluídas com falhas OU aguardando
  //       aceitação IA (gate A.4), ordenadas =====
  const triagemTasks = useMemo<TaskWithFailures[]>(() => {
    const out: TaskWithFailures[] = [];
    for (const t of tasks) {
      if (t.arquivadoEm) continue;
      if (t.status === STATUS.CONCLUIDO) continue;
      const failures = triageFailures(t);
      const aguardandoIA = isPreTriagem(t);
      // Pre-triagem IA aparece SEMPRE — mesmo sem field failures (a
      // própria ausência de "triada_em" é o failure relevante aqui).
      if (!failures.length && !aguardandoIA) continue;
      // Marca "aguardando aceitação" como failure virtual pra UI ranquear
      const allFailures = aguardandoIA ? ['aguardando aceitação IA', ...failures] : failures;
      out.push({ ...t, _failures: allFailures, _failCount: allFailures.length });
    }
    // IA pre-triagem sobe (failure count maior + flag) seguido por com-falhas
    out.sort((a, b) => {
      const aiA = isPreTriagem(a) ? 1 : 0;
      const aiB = isPreTriagem(b) ? 1 : 0;
      if (aiA !== aiB) return aiB - aiA; // IA pre-triagem primeiro
      return b._failCount - a._failCount || (a.criadoEm || 0) - (b.criadoEm || 0);
    });
    return out;
  }, [tasks]);

  // Aplica filtro arbitrário (não-state) — usado tanto pelo `filtered` real
  // quanto pelos previews de count "se eu ligar esse chip mantendo os outros".
  const applyFilter = useCallback(
    (arr: TaskWithFailures[], f: TriagemFilter) =>
      arr.filter((t) => {
        if (f.semCliente && !t._failures.includes('sem cliente')) return false;
        if (f.semProjeto && !t._failures.includes('sem projeto')) return false;
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

  const anyFilter =
    filter.semCliente || filter.semProjeto || filter.semResp ||
    filter.semPrazo || filter.semEsforco || !!filter.origem;

  // Counts dinâmicos: quantas tasks sobrariam SE esse chip estivesse ativo,
  // mantendo os outros filtros. Padrão "filtros responsivos" — você vê o
  // impacto antes de clicar. Chip já ativo mostra o count atual do recorte.
  const counts = useMemo(
    () => ({
      semCliente: applyFilter(triagemTasks, { ...filter, semCliente: true }).length,
      semProjeto: applyFilter(triagemTasks, { ...filter, semProjeto: true }).length,
      semResp: applyFilter(triagemTasks, { ...filter, semResp: true }).length,
      semPrazo: applyFilter(triagemTasks, { ...filter, semPrazo: true }).length,
      semEsforco: applyFilter(triagemTasks, { ...filter, semEsforco: true }).length,
      ia: applyFilter(triagemTasks, { ...filter, origem: 'ia' }).length,
    }),
    [triagemTasks, filter, applyFilter],
  );

  // ===== Quick-edit inline pro fluxo de triagem =====
  const setField = useCallback(
    async (taskId: string, snake: string, dbValue: unknown, jsKey: keyof Task, localValue: unknown) => {
      const { error } = await sb.from('tasks').update({ [snake]: dbValue }).eq('id', taskId);
      if (error) {
        toast.error('Erro ao atualizar: ' + error.message);
        return;
      }
      patchTask(taskId, { [jsKey]: localValue } as Partial<Task>);
    },
    [sb, patchTask, toast],
  );

  // ===== Aceitar IA: marca triada_em + triada_por, task entra no backlog =====
  const aceitarIA = useCallback(
    async (taskId: string) => {
      const nowIso = new Date().toISOString();
      const triadaPor = currentPessoa?.id ?? null;
      const { error } = await sb
        .from('tasks')
        .update({ triada_em: nowIso, triada_por: triadaPor })
        .eq('id', taskId);
      if (error) {
        toast.error('Erro ao aceitar: ' + error.message);
        return;
      }
      patchTask(taskId, { triadaEm: nowIso, triadaPor });
      toast.success('Task aceita. Entra no backlog agora.');
    },
    [sb, patchTask, currentPessoa, toast],
  );

  // ===== Rejeitar IA: triada_em + arquivado_em + motivo (audit) =====
  // Motivo vem do picklist inline (IaRejectPicker) — nunca prompt nativo.
  const rejeitarIA = useCallback(
    async (taskId: string, motivo: string) => {
      const motivoFinal = motivo.trim() || 'rejeitada na triagem';
      const nowIso = new Date().toISOString();
      const triadaPor = currentPessoa?.id ?? null;
      const { error } = await sb
        .from('tasks')
        .update({
          triada_em: nowIso,
          triada_por: triadaPor,
          arquivado_em: nowIso,
          motivo_arquivamento: motivoFinal,
        })
        .eq('id', taskId);
      if (error) {
        toast.error('Erro ao rejeitar: ' + error.message);
        return;
      }
      patchTask(taskId, {
        triadaEm: nowIso,
        triadaPor,
        arquivadoEm: nowIso,
        motivoArquivamento: motivoFinal,
      });
      toast.success(`Rejeitada: ${motivoFinal}.`);
    },
    [sb, patchTask, currentPessoa, toast],
  );

  // ===== Salvar triagem manual: feedback explícito quando os 5
  // campos foram preenchidos inline. Os campos já gravaram via
  // setField; aqui só confirmamos visualmente (a row some sozinha
  // porque triageFailures volta vazio). =====
  const salvarManual = useCallback(
    (_taskId: string) => {
      toast.success('Triagem concluída · task vai pro backlog.');
    },
    [toast],
  );

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
                  active={filter.semCliente}
                  onClick={() => setFilter({ ...filter, semCliente: !filter.semCliente })}
                  count={counts.semCliente}
                  label="sem cliente"
                />
                <FilterChip
                  active={filter.semProjeto}
                  onClick={() => setFilter({ ...filter, semProjeto: !filter.semProjeto })}
                  count={counts.semProjeto}
                  label="sem projeto"
                />
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
            active={filter.semCliente}
            onClick={() => setFilter({ ...filter, semCliente: !filter.semCliente })}
            count={counts.semCliente}
            label="sem cliente"
            mobile
          />
          <FilterChip
            active={filter.semProjeto}
            onClick={() => setFilter({ ...filter, semProjeto: !filter.semProjeto })}
            count={counts.semProjeto}
            label="sem projeto"
            mobile
          />
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
        const preTriagem = isPreTriagem(t);
        const idade = t.criadoEm > 0 ? agingDays({ statusEm: t.criadoEm }) : 0;
        // Cor de aging: ≥7d vermelho, ≥3d âmbar, senão muted
        const ageColor = idade >= 7 ? 'var(--danger)' : idade >= 3 ? 'var(--warn)' : undefined;
        return (
          <div
            key={t.id}
            className={`card p-3 md:p-5 cursor-pointer hover:border-line-strong transition-colors ${preTriagem ? 'border-l-[3px]' : ''}`}
            style={preTriagem ? { borderLeftColor: 'var(--green)' } : undefined}
            onClick={() => openEdit(t.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
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
                      o ritmo de metadata "etapa + idade". Aging colorido
                      pra IA pre-triagem (≥3d âmbar / ≥7d vermelho). */}
                  <div className="text-xs text-muted font-mono break-words">
                    {SUB_LABELS[t.subetapa] ?? t.subetapa}
                    {t.criadoEm > 0 && (
                      <>
                        {' · criada há '}
                        <span style={ageColor ? { color: ageColor, fontWeight: 600 } : undefined}>
                          {idade}d
                        </span>
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
            <div className="flex flex-wrap gap-1 mt-2 md:hidden">
              {t._failures.map((f) => (
                <span key={f} className="triage-chip">
                  {f}
                </span>
              ))}
            </div>

            {/* Quick-edit + ação · IA: Aceitar/Rejeitar · Manual: só Salvar */}
            <IaTriageActions
              task={t}
              mode={preTriagem ? 'ia' : 'manual'}
              pessoasNaoCliente={pessoasNaoCliente}
              clientes={clientes}
              projetos={projetos}
              onUpdateField={setField}
              onAccept={() => (preTriagem ? aceitarIA(t.id) : salvarManual(t.id))}
              onReject={(motivo) => rejeitarIA(t.id, motivo)}
            />
          </div>
        );
      })}

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

// ─────────────────────────────────────────────────────────
//  IaTriageActions · quick-edit + Aceitar/Rejeitar (A.4)
// ─────────────────────────────────────────────────────────
// Aparece SÓ na row quando a task é isPreTriagem (IA criada, sem
// triada_em). 3 inputs inline (Responsável · Prazo · Esforço) +
// botões Aceitar/Rejeitar. Aceitar fica disabled até os 3 campos
// estarem preenchidos. Tooltip lista o que falta.

const REJECT_REASONS = [
  'Duplicada',
  'Fora de escopo',
  'Spam',
  'Sem contexto',
  'Não acionável',
] as const;

function IaTriageActions({
  task,
  mode,
  pessoasNaoCliente,
  clientes,
  projetos,
  onUpdateField,
  onAccept,
  onReject,
}: {
  task: Task;
  /** 'ia' = aceitar+rejeitar (popover); 'manual' = só salvar (mesmo gate). */
  mode: 'ia' | 'manual';
  pessoasNaoCliente: Pessoa[];
  clientes: Cliente[];
  projetos: Projeto[];
  onUpdateField: (
    taskId: string,
    snake: string,
    dbValue: unknown,
    jsKey: keyof Task,
    localValue: unknown,
  ) => Promise<void> | void;
  onAccept: () => void;
  onReject: (motivo: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [customMotivo, setCustomMotivo] = useState('');

  // Clientes ativos · ordenados alfabético
  const clientesOpts = useMemo(
    () => clientes.filter((c) => !c.arquivadoEm).sort((a, b) => a.nome.localeCompare(b.nome)),
    [clientes],
  );
  // Projetos do cliente selecionado · ativos · alfabético
  const projetosOpts = useMemo(() => {
    if (!task.clienteId) return [] as Projeto[];
    return projetos
      .filter((p) => p.clienteId === task.clienteId && !p.arquivadoEm)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [projetos, task.clienteId]);

  // Mesmo gate de triageFailures: cliente/projeto/resp sempre;
  // prazo/esforço só a partir de escopo_definido (rank >= 3).
  const rank = STAGE_RANK[task.subetapa] ?? 0;
  const exigePrazoEsforco = rank >= TRIAGE_RANK_GATE;
  const faltam: string[] = [];
  if (!task.clienteId) faltam.push('cliente');
  if (!task.projetoId) faltam.push('projeto');
  if (!task.pessoaId) faltam.push('responsável');
  if (exigePrazoEsforco && !task.prazo) faltam.push('prazo');
  if (exigePrazoEsforco && (!task.esforco || task.esforco <= 0)) faltam.push('esforço');
  const canAccept = faltam.length === 0;

  const submitReject = (motivo: string) => {
    setRejectOpen(false);
    setCustomMotivo('');
    onReject(motivo);
  };

  return (
    <div
      className="mt-3 pt-3 border-t border-line flex flex-col md:flex-row md:items-center gap-2 md:gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {/* Cliente */}
        <select
          value={task.clienteId || ''}
          onChange={(e) => {
            const next = e.target.value || null;
            onUpdateField(task.id, 'cliente_id', next, 'clienteId', e.target.value || '');
            // Trocou cliente · projeto antigo provavelmente não pertence; limpa
            if (task.projetoId) {
              onUpdateField(task.id, 'projeto_id', null, 'projetoId', '');
            }
          }}
          className="inp text-xs py-1.5 px-2"
          style={{ width: 'auto', minWidth: 130 }}
          title="Cliente"
        >
          <option value="">— cliente —</option>
          {clientesOpts.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>

        {/* Projeto · depende de cliente */}
        <select
          value={task.projetoId || ''}
          onChange={(e) => onUpdateField(task.id, 'projeto_id', e.target.value || null, 'projetoId', e.target.value || '')}
          className="inp text-xs py-1.5 px-2"
          style={{ width: 'auto', minWidth: 130 }}
          disabled={!task.clienteId}
          title={task.clienteId ? 'Projeto' : 'Selecione um cliente primeiro'}
        >
          <option value="">— projeto —</option>
          {projetosOpts.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>

        {/* Responsável */}
        <select
          value={task.pessoaId || ''}
          onChange={(e) => onUpdateField(task.id, 'pessoa_id', e.target.value || null, 'pessoaId', e.target.value || '')}
          className="inp text-xs py-1.5 px-2"
          style={{ width: 'auto', minWidth: 130 }}
          title="Responsável"
        >
          <option value="">— responsável —</option>
          {pessoasNaoCliente.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>

        {/* Prazo */}
        <input
          type="date"
          value={task.prazo || ''}
          onChange={(e) => onUpdateField(task.id, 'prazo', e.target.value || null, 'prazo', e.target.value || '')}
          className="inp text-xs py-1.5 px-2"
          style={{ width: 'auto' }}
          title="Prazo"
        />

        {/* Esforço */}
        <input
          type="number"
          min={0}
          step={0.5}
          value={task.esforco || ''}
          onChange={(e) => {
            const num = Number(e.target.value) || 0;
            onUpdateField(task.id, 'esforco', num, 'esforco', num);
          }}
          placeholder="esforço (h)"
          className="inp text-xs py-1.5 px-2"
          style={{ width: 110 }}
          title="Esforço em horas"
        />
      </div>

      <div className="flex items-center gap-2 shrink-0 relative">
        {mode === 'ia' && (
          <>
            <button
              type="button"
              onClick={() => setRejectOpen((v) => !v)}
              className="btn btn-ghost text-xs"
              style={{ color: 'var(--danger)' }}
              title="Rejeitar (arquiva com motivo)"
            >
              Rejeitar
            </button>
            {rejectOpen && (
              <RejectPopover
                value={customMotivo}
                onChange={setCustomMotivo}
                onPick={submitReject}
                onClose={() => setRejectOpen(false)}
              />
            )}
          </>
        )}
        <button
          type="button"
          onClick={canAccept ? onAccept : undefined}
          disabled={!canAccept}
          className="btn btn-primary text-xs"
          title={
            canAccept
              ? mode === 'ia' ? 'Aceitar · entra no backlog' : 'Salvar · triagem concluída'
              : `Faltam: ${faltam.join(', ')}`
          }
          style={!canAccept ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
        >
          {mode === 'ia' ? 'Aceitar' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
//  RejectPopover · picklist de motivos pra rejeição IA (A.4)
// ─────────────────────────────────────────────────────────
// Dropdown ancorado embaixo do botão Rejeitar. Motivos pré-definidos
// + input "outro motivo" pra texto livre. Padrão visual igual ao
// TaskPickerPopover do TimerButton (border-line + shadow-xl, z-50).

function RejectPopover({
  value,
  onChange,
  onPick,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (motivo: string) => void;
  onClose: () => void;
}) {
  const ref = useClickAway<HTMLDivElement>(onClose);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 z-50 w-[240px] bg-bg-elev border border-line rounded-lg shadow-xl overflow-hidden"
      role="dialog"
      aria-label="Motivo da rejeição"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="w-2 h-2 rounded-full bg-[color:var(--danger)] shrink-0" />
        <span className="text-sm font-medium">Rejeitar · motivo</span>
      </div>
      <ul className="py-1">
        {REJECT_REASONS.map((r) => (
          <li key={r}>
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-bg-alt transition-colors"
              onClick={() => onPick(r)}
            >
              {r}
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-line p-2">
        <input
          ref={inputRef}
          type="text"
          className="inp text-xs w-full"
          placeholder="outro motivo…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              onPick(value.trim());
            }
          }}
        />
      </div>
    </div>
  );
}
