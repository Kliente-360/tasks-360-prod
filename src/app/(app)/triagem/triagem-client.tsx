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
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/page-header';
import { PillsFilter } from '@/components/pills-filter';
import { PriChip, TagIA } from '@/components/task-card/primitives';
import { createClient } from '@/lib/supabase/client';
import { agingDays, isPreTriagem, triageFailures, TRIAGE_RANK_GATE } from '@/lib/task-utils';
import { STATUS, SUB_LABELS, STAGE_RANK } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import type { Task, Pessoa, Cliente, Projeto } from '@/lib/types';
import { useClickAway } from '@/lib/use-click-away';
import { Icon } from '@/components/icons';

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
    () => pessoas.filter((p) => p.role !== 'cliente' && p.invited_at !== null),
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
    // IA pre-triagem primeiro (gate prioritário); demais ordenadas por
    // criação DESCENDENTE (mais recentes no topo). A ordem é estável
    // durante edição porque o draft não toca o store até clicar Salvar.
    out.sort((a, b) => {
      const aiA = isPreTriagem(a) ? 1 : 0;
      const aiB = isPreTriagem(b) ? 1 : 0;
      if (aiA !== aiB) return aiB - aiA;
      return (b.criadoEm || 0) - (a.criadoEm || 0);
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

  // ===== Persistência centralizada · grava o draft inline + opcional
  //       triada_em/triada_por (IA) e retorna a row pra desaparecer
  //       só depois do save bem-sucedido. =====
  const persistTriageDraft = useCallback(
    async (taskId: string, draft: TriageDraft, opts: { markTriada: boolean }) => {
      const dbPatch: Record<string, unknown> = {
        cliente_id: draft.clienteId || null,
        projeto_id: draft.projetoId || null,
        pessoa_id: draft.pessoaId || null,
        prazo: draft.prazo || null,
        esforco: draft.esforco || null,
      };
      const localPatch: Partial<Task> = {
        clienteId: draft.clienteId,
        projetoId: draft.projetoId,
        pessoaId: draft.pessoaId,
        prazo: draft.prazo,
        esforco: draft.esforco,
      };
      const nowIso = new Date().toISOString();
      const triadaPor = currentPessoa?.id ?? null;
      if (opts.markTriada) {
        dbPatch.triada_em = nowIso;
        dbPatch.triada_por = triadaPor;
        localPatch.triadaEm = nowIso;
        localPatch.triadaPor = triadaPor;
      }
      const { error } = await sb.from('tasks').update(dbPatch).eq('id', taskId);
      if (error) {
        toast.error('Erro ao salvar: ' + error.message);
        return false;
      }
      patchTask(taskId, localPatch);
      return true;
    },
    [sb, patchTask, currentPessoa, toast],
  );

  // ===== Aceitar IA (salva draft + marca triada_em) =====
  const aceitarIA = useCallback(
    async (taskId: string, draft: TriageDraft) => {
      const ok = await persistTriageDraft(taskId, draft, { markTriada: true });
      if (ok) toast.success('Task aceita. Entra no backlog agora.');
    },
    [persistTriageDraft, toast],
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

  // ===== Salvar triagem manual: persiste os 5 campos do draft de uma
  //       vez (não autosave). A row some sozinha porque triageFailures
  //       volta vazio. =====
  const salvarManual = useCallback(
    async (taskId: string, draft: TriageDraft) => {
      const ok = await persistTriageDraft(taskId, draft, { markTriada: false });
      if (ok) toast.success('Triagem concluída · task vai pro backlog.');
    },
    [persistTriageDraft, toast],
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
                  {/* Linha 3 removida · cliente/projeto/resp/prazo já
                      aparecem como chips de failure à direita e/ou
                      preenchidos no quick-edit abaixo. */}
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

            {/* Quick-edit + ação · IA: Aceitar/Rejeitar · Manual: só Salvar.
                Edição é PENDENTE (não autosave) — persiste só ao clicar. */}
            <IaTriageActions
              task={t}
              mode={preTriagem ? 'ia' : 'manual'}
              pessoasNaoCliente={pessoasNaoCliente}
              clientes={clientes}
              projetos={projetos}
              onAccept={(draft) =>
                preTriagem ? aceitarIA(t.id, draft) : salvarManual(t.id, draft)
              }
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

/** Edição pendente · NÃO persiste a cada keystroke; só ao clicar Salvar/Aceitar.
 *  Mantém a fila de triagem estável enquanto o usuário tria uma a uma. */
type TriageDraft = {
  clienteId: string;
  projetoId: string;
  pessoaId: string;
  prazo: string;
  esforco: number;
};

function IaTriageActions({
  task,
  mode,
  pessoasNaoCliente,
  clientes,
  projetos,
  onAccept,
  onReject,
}: {
  task: Task;
  /** 'ia' = aceitar+rejeitar (popover); 'manual' = só salvar (mesmo gate). */
  mode: 'ia' | 'manual';
  pessoasNaoCliente: Pessoa[];
  clientes: Cliente[];
  projetos: Projeto[];
  onAccept: (draft: TriageDraft) => void;
  onReject: (motivo: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [customMotivo, setCustomMotivo] = useState('');

  // Draft local — reseta se o task mudar externamente (realtime).
  const [draft, setDraft] = useState<TriageDraft>({
    clienteId: task.clienteId || '',
    projetoId: task.projetoId || '',
    pessoaId: task.pessoaId || '',
    prazo: task.prazo || '',
    esforco: Number(task.esforco) || 0,
  });
  useEffect(() => {
    setDraft({
      clienteId: task.clienteId || '',
      projetoId: task.projetoId || '',
      pessoaId: task.pessoaId || '',
      prazo: task.prazo || '',
      esforco: Number(task.esforco) || 0,
    });
  }, [task.id, task.clienteId, task.projetoId, task.pessoaId, task.prazo, task.esforco]);

  // Clientes ativos · ordenados alfabético
  const clientesOpts = useMemo(
    () => clientes.filter((c) => !c.arquivadoEm).sort((a, b) => a.nome.localeCompare(b.nome)),
    [clientes],
  );
  // Projetos do cliente do DRAFT (não do task) · ativos · alfabético
  const projetosOpts = useMemo(() => {
    if (!draft.clienteId) return [] as Projeto[];
    return projetos
      .filter((p) => p.clienteId === draft.clienteId && !p.arquivadoEm)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [projetos, draft.clienteId]);

  // Mesmo gate de triageFailures, calculado sobre o DRAFT.
  const rank = STAGE_RANK[task.subetapa] ?? 0;
  const exigePrazoEsforco = rank >= TRIAGE_RANK_GATE;
  const faltam: string[] = [];
  if (!draft.clienteId) faltam.push('cliente');
  if (!draft.projetoId) faltam.push('projeto');
  if (!draft.pessoaId) faltam.push('responsável');
  if (exigePrazoEsforco && !draft.prazo) faltam.push('prazo');
  if (exigePrazoEsforco && (!draft.esforco || draft.esforco <= 0)) faltam.push('esforço');
  const canAccept = faltam.length === 0;

  const isDirty =
    draft.clienteId !== (task.clienteId || '') ||
    draft.projetoId !== (task.projetoId || '') ||
    draft.pessoaId !== (task.pessoaId || '') ||
    draft.prazo !== (task.prazo || '') ||
    draft.esforco !== (Number(task.esforco) || 0);

  const submitReject = (motivo: string) => {
    setRejectOpen(false);
    setCustomMotivo('');
    onReject(motivo);
  };

  // Larguras fixas (todos os 5 campos no mesmo tamanho).
  const FIELD_W = 'w-[170px]';

  return (
    <div
      className="mt-3 pt-3 border-t border-line flex flex-col md:flex-row md:items-center gap-2 md:gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {/* Cliente */}
        <TriageInlineField icon="building" title="Cliente" width={FIELD_W}>
          <select
            value={draft.clienteId}
            onChange={(e) => {
              const next = e.target.value;
              setDraft((d) => ({
                ...d,
                clienteId: next,
                // troca de cliente invalida o projeto
                projetoId: next !== d.clienteId ? '' : d.projetoId,
              }));
            }}
            className="triage-inline-select"
          >
            <option value="">Cliente</option>
            {clientesOpts.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </TriageInlineField>

        {/* Projeto · depende de cliente */}
        <TriageInlineField
          icon="folder"
          title={draft.clienteId ? 'Projeto' : 'Selecione um cliente primeiro'}
          width={FIELD_W}
          disabled={!draft.clienteId}
        >
          <select
            value={draft.projetoId}
            onChange={(e) => setDraft((d) => ({ ...d, projetoId: e.target.value }))}
            disabled={!draft.clienteId}
            className="triage-inline-select"
          >
            <option value="">Projeto</option>
            {projetosOpts.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </TriageInlineField>

        {/* Responsável */}
        <TriageInlineField icon="users" title="Responsável" width={FIELD_W}>
          <select
            value={draft.pessoaId}
            onChange={(e) => setDraft((d) => ({ ...d, pessoaId: e.target.value }))}
            className="triage-inline-select"
          >
            <option value="">Responsável</option>
            {pessoasNaoCliente.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </TriageInlineField>

        {/* Prazo */}
        <TriageInlineField icon="calendar" title="Prazo" width={FIELD_W}>
          <input
            type="date"
            value={draft.prazo}
            onChange={(e) => setDraft((d) => ({ ...d, prazo: e.target.value }))}
            className="triage-inline-select"
          />
        </TriageInlineField>

        {/* Esforço (horas) */}
        <TriageInlineField icon="timer" title="Esforço em horas" width={FIELD_W}>
          <input
            type="number"
            min={0}
            step={0.5}
            value={draft.esforco || ''}
            onChange={(e) => setDraft((d) => ({ ...d, esforco: Number(e.target.value) || 0 }))}
            placeholder="Esforço (h)"
            className="triage-inline-select"
          />
        </TriageInlineField>
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
          onClick={canAccept ? () => onAccept(draft) : undefined}
          disabled={!canAccept}
          className="btn btn-primary text-xs"
          title={
            canAccept
              ? mode === 'ia'
                ? `Aceitar${isDirty ? ' (salva mudanças)' : ''} · entra no backlog`
                : `Salvar${isDirty ? ' mudanças' : ''} · triagem concluída`
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
//  TriageInlineField · wrapper visual pros 5 inputs da triagem
// ─────────────────────────────────────────────────────────
// Caixinha [icon · select/input] com largura FIXA — não cresce com
// valor selecionado. Visual inspirado nos pills da FilterBar.

function TriageInlineField({
  icon,
  title,
  width,
  disabled,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  width: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`triage-inline-field ${width} ${disabled ? 'opacity-60' : ''}`}
      title={title}
    >
      <Icon name={icon} size={13} className="ic" />
      {children}
    </span>
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
