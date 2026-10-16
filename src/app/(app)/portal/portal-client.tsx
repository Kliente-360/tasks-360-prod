'use client';
import { track } from '@/lib/telemetry';

/**
 * Portal cliente · UI principal.
 *
 * Composição (out/2026):
 * - Barra do cliente (cor do cliente): nome + visão Kanban/Lista + busca +
 *   filtros (projeto, prazo, prioridade multiselect) + switcher (admin/interno)
 * - Banner "aguardando você" (homologar entrega / responder pendência)
 * - Alertas amigáveis · 5 KPIs (mesmos do Backlog)
 * - Kanban 5 colunas ou Lista · concluídas só do mês anterior em diante
 * - Caixas de IA (entregas de valor · riscos)
 *
 * Cliente externo (role='cliente'): cid vem de currentPessoa.cliente_id, sem
 * opção de simular. Admin/interno: cid livre, persistido em localStorage.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '@/lib/data-store';
import { ROLE, STATUS, SUB_LABELS, SUBS_FLAT_ORDER } from '@/lib/task-constants';
import { atrasada as isAtrasada } from '@/lib/task-utils';
import { fmtDate, fmtDataCurta } from '@/lib/format';
import type { Task } from '@/lib/types';
import { usePortalData } from './use-portal-data';
import { usePortalNomes } from './use-portal-nomes';
import { PortalIaBoxes } from './portal-ia-boxes';
import { CabecalhoRecolher, useSecaoAberta } from './recolher';
import { PortalTaskModal } from './portal-task-modal';
import { PortalNewTaskForm } from './portal-new-task-form';
import { Icon } from '@/components/icons';
import { useClickAway } from '@/lib/use-click-away';
import { TaskCard } from '@/components/task-card/task-card';

/** 5 colunas do Kanban do Portal. Homologação e Bloqueado são onde o
 *  cliente costuma ter ação pendente. Etapas pós-homologação (revisão,
 *  pronto p/ produção, implantação) ficam em "Em desenvolvimento" — a
 *  subetapa no card diz exatamente onde está. */
const PORTAL_COLS = [
  { key: 'backlog', label: 'Backlog', subs: ['backlog', 'priorizado', 'em_definicao', 'escopo_definido'] },
  { key: 'desenvolvimento', label: 'Em desenvolvimento', subs: ['em_desenvolvimento', 'em_revisao', 'pronto_producao', 'em_implantacao'] },
  { key: 'homologacao', label: 'Em homologação', subs: ['em_homologacao'] },
  { key: 'bloqueado', label: 'Bloqueado', subs: ['bloqueado'] },
  { key: 'concluido', label: 'Concluído', subs: ['concluido'] },
] as const;
type PortalColKey = (typeof PORTAL_COLS)[number]['key'];
const SUB_TO_COL: Record<string, PortalColKey> = Object.fromEntries(
  PORTAL_COLS.flatMap((c) => c.subs.map((s) => [s, c.key])),
);

const PRIO_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;
const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, '': 9 };

type PrazoFiltro = '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';

/** Cliente tem ação pendente: homologar entrega ou responder bloqueio. */
function acaoDoCliente(t: Task): 'homologar' | 'responder' | null {
  if (t.subetapa === 'em_homologacao' && t.aprovadoEm == null) return 'homologar';
  if (t.subetapa === 'bloqueado' && t.bloqueadoPor === 'cliente' && !t.pendenciaRespondidaEm) return 'responder';
  return null;
}

/** Concluídas visíveis: só do mês anterior em diante. */
function inicioMesAnteriorMs(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
}
function concluidaEmMs(t: Task): number {
  return t.statusEm || t.aprovadoEm || t.subetapaEm || 0;
}

/** Etapa na ordem padrão: bloqueadas primeiro, depois a mais perto da
 *  entrega (implantação → … → backlog); concluídas sempre no fim. */
function rankEtapa(t: Task): number {
  if (t.status === STATUS.CONCLUIDO || t.subetapa === 'concluido') return 99;
  if (t.subetapa === 'bloqueado') return -1;
  return -(SUBS_FLAT_ORDER[t.subetapa] ?? -50);
}

/** Ordem padrão: ação do cliente → etapa → prioridade → prazo. */
function compararPortal(a: Task, b: Task): number {
  const ac = (acaoDoCliente(a) ? 0 : 1) - (acaoDoCliente(b) ? 0 : 1);
  if (ac !== 0) return ac;
  const ed = rankEtapa(a) - rankEtapa(b);
  if (ed !== 0) return ed;
  const pd = (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9);
  if (pd !== 0) return pd;
  return (a.prazo || '9999') < (b.prazo || '9999') ? -1 : 1;
}

const VIEW_LS_KEY = 'kliente360-portal-view';

const LS_KEY = 'kliente360-portal-cliente';

export function PortalClient() {
  const { clientes, projetos, currentPessoa, viewerRole } = useData();

  // Cliente sendo visualizado. Cliente real: trava no próprio cliente_id.
  // Admin/interno: simulam via selector (persistido em localStorage).
  const [portalClienteId, setPortalClienteIdState] = useState<string>('');

  useEffect(() => {
    if (viewerRole === ROLE.CLIENTE) return;
    try {
      const saved = localStorage.getItem(LS_KEY) || '';
      setPortalClienteIdState(saved);
    } catch {
      /* noop */
    }
  }, [viewerRole]);

  const setPortalClienteId = (cid: string) => {
    setPortalClienteIdState(cid);
    try {
      localStorage.setItem(LS_KEY, cid);
    } catch {
      /* noop */
    }
  };

  // effectivePortalClienteId: cliente real usa cliente_id próprio, sem opção de simular.
  const effectiveCid =
    viewerRole === ROLE.CLIENTE ? currentPessoa?.cliente_id ?? '' : portalClienteId;

  // Lista de clientes externos (sem bucket interno) — usada no switcher
  const clientesAtivosExternos = useMemo(
    () => clientes.filter((c) => !c.arquivadoEm && !c.ehInterno),
    [clientes],
  );

  const portalCliente = useMemo(
    () => clientes.find((c) => c.id === effectiveCid) ?? null,
    [clientes, effectiveCid],
  );

  const { portalTasks, alerts } = usePortalData(effectiveCid);

  // Modal state
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const closeModal = () => setOpenTask(null);
  // 3.D · estado do form "Nova solicitação" · abre via evento
  // `portal:new-task` disparado pelo botão + Solicitação do header.
  const [showNewTask, setShowNewTask] = useState(false);
  useEffect(() => {
    const handler = () => setShowNewTask(true);
    window.addEventListener('portal:new-task', handler);
    return () => window.removeEventListener('portal:new-task', handler);
  }, []);

  // Clique numa notificação do sino (cliente) abre o modal da task aqui
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const t = portalTasks.find((x) => x.id === id);
      if (t) openPortalTask(t);
    };
    window.addEventListener('portal:open-task', handler);
    return () => window.removeEventListener('portal:open-task', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalTasks]);

  // Visão Kanban × Lista (preferência por navegador)
  const [view, setViewState] = useState<'kanban' | 'lista'>('kanban');
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_LS_KEY);
      if (v === 'lista' || v === 'kanban') setViewState(v);
    } catch {
      /* noop */
    }
  }, []);
  const setView = (v: 'kanban' | 'lista') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_LS_KEY, v);
    } catch {
      /* noop */
    }
  };

  // Filtros (mesma busca do Backlog · debounce 150ms)
  const [qDraft, setQDraft] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(qDraft), 150);
    return () => clearTimeout(id);
  }, [qDraft]);
  // Telemetria de busca: só registra que buscou (e o tamanho), não o texto
  useEffect(() => {
    if (!q.trim()) return;
    const id = setTimeout(() => track('busca', { props: { tela: 'portal', tamanho: q.trim().length } }), 1200);
    return () => clearTimeout(id);
  }, [q]);
  const [kbProjeto, setKbProjeto] = useState('');
  const [kbPrazo, setKbPrazo] = useState<PrazoFiltro>('');
  const [kbPrio, setKbPrio] = useState<Set<string>>(new Set());
  const toggleKbPrio = (p: string) => {
    setKbPrio((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };
  const kbActive =
    (qDraft ? 1 : 0) +
    (kbProjeto ? 1 : 0) +
    (kbPrazo ? 1 : 0) +
    (kbPrio.size > 0 ? 1 : 0);
  const clearFilters = () => {
    setQDraft('');
    setKbProjeto('');
    setKbPrazo('');
    setKbPrio(new Set());
  };

  const openPortalTask = (t: Task) => {
    // Defesa em profundidade: garante que a task pertence ao cliente
    // e é visível. RLS já bloqueia no banco; este guard evita race conditions
    // (ex: realtime entregando task antes da filtragem).
    if (!t || t.clienteId !== effectiveCid || t.visivelCliente === false || t.arquivadoEm) {
      return;
    }
    track('task_open', { task_id: t.id, props: { portal: true } });
    setOpenTask(t);
  };

  // Lookups
  const projetosById = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);
  // Cliente não lê `pessoas` (RLS) · nomes dos responsáveis vêm por RPC
  const nomes = usePortalNomes(effectiveCid);
  const pessoasById = useMemo(
    () => new Map([...nomes].map(([id, nome]) => [id, { nome }])),
    [nomes],
  );

  const today = new Date().toISOString().slice(0, 10);

  // Tasks visíveis no Kanban/Lista: filtros + concluídas só do mês
  // anterior em diante.
  const visibleTasks = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    const in7Iso = in7.toISOString().slice(0, 10);
    const cutoff = inicioMesAnteriorMs();
    return portalTasks
      .filter((t) => {
        if (t.status === STATUS.CONCLUIDO && concluidaEmMs(t) < cutoff) return false;
        if (qq) {
          const hay = [
            t.titulo,
            t.descricao ?? '',
            projetosById.get(t.projetoId)?.nome ?? '',
            pessoasById.get(t.pessoaId)?.nome ?? '',
            t.prioridade,
            SUB_LABELS[t.subetapa] ?? t.subetapa,
          ].join(' ').toLowerCase();
          if (!hay.includes(qq)) return false;
        }
        if (kbProjeto && t.projetoId !== kbProjeto) return false;
        if (kbPrio.size > 0 && !kbPrio.has(t.prioridade || '')) return false;
        if (kbPrazo === 'atrasadas' && !(t.prazo && t.status !== STATUS.CONCLUIDO && t.prazo < today)) return false;
        if (kbPrazo === 'hoje' && t.prazo !== today) return false;
        if (kbPrazo === 'semana' && !(t.prazo && t.prazo >= today && t.prazo <= in7Iso)) return false;
        if (kbPrazo === 'sem' && t.prazo) return false;
        return true;
      })
      .sort(compararPortal);
  }, [portalTasks, q, kbProjeto, kbPrio, kbPrazo, today, projetosById, pessoasById]);

  // Itens com ação do cliente (independe dos filtros) · alimentam o banner
  const acaoItems = useMemo(
    () =>
      portalTasks
        .filter((t) => acaoDoCliente(t))
        .sort((a, b) => (a.subetapaEm || 0) - (b.subetapaEm || 0)),
    [portalTasks],
  );

  // Modal lê a versão viva da store (reflete aprovação na hora)
  const liveOpenTask = openTask
    ? portalTasks.find((t) => t.id === openTask.id) ?? openTask
    : null;

  // ---- Setup banner (sem cliente selecionado) ----
  if (!effectiveCid) {
    return (
      <div className="fade-up">
        <div className="card p-6 text-center md:p-10">
          <div className="mb-2 font-brand text-lg font-semibold md:text-xl">
            Portal do cliente
          </div>
          <div className="mb-4 text-sm text-ink-soft">
            {viewerRole !== ROLE.CLIENTE ? (
              <span>Escolha um cliente pra visualizar o portal como ele veria:</span>
            ) : (
              <span>
                Sua sessão não está vinculada a um cliente. Peça pro admin verificar o
                cadastro.
              </span>
            )}
          </div>
          {viewerRole !== ROLE.CLIENTE && (
            <div className="flex justify-center">
              <select
                className="inp w-full md:w-[280px]"
                value={portalClienteId}
                onChange={(e) => setPortalClienteId(e.target.value)}
              >
                <option value="">— selecionar cliente —</option>
                {clientesAtivosExternos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Conteúdo do portal ----
  return (
    <div className="fade-up space-y-3 md:space-y-4">
      {/* 1. HEADER-BAR · nome do cliente (esquerda) + filtros do Kanban
             (direita, mesmo estilo do FilterBar do Backlog). Fundo com
             a cor do cliente (corPortal). Switcher de cliente (admin/
             interno) fica no canto discreto quando aplicável. v1.03.219 */}
      <div
        className={`portal-headerbar ${
          portalCliente?.corPortalTexto === 'dark' ? 'theme-dark-text' : ''
        }`}
        style={
          portalCliente?.corPortal
            ? { background: portalCliente.corPortal }
            : undefined
        }
      >
        <div className="portal-headerbar-title">
          <div className="portal-headerbar-eyebrow">Portal · Kliente 360</div>
          <div className="portal-headerbar-name">{portalCliente?.nome ?? ''}</div>
        </div>

        <div className="portal-headerbar-filters">
          <div className="view-toggle view-toggle-icons portal-so-desktop" role="tablist" aria-label="Visão">
            <button
              type="button"
              className={view === 'kanban' ? 'active' : ''}
              onClick={() => setView('kanban')}
              title="Visão Kanban"
              aria-label="Visão Kanban"
            >
              <Icon name="columns" size={15} />
            </button>
            <button
              type="button"
              className={view === 'lista' ? 'active' : ''}
              onClick={() => setView('lista')}
              title="Visão lista"
              aria-label="Visão lista"
            >
              <Icon name="list" size={15} />
            </button>
          </div>
          <label className="search">
            <Icon name="search" size={14} className="ic" />
            <input
              type="text"
              value={qDraft}
              placeholder="Buscar"
              onChange={(e) => setQDraft(e.target.value)}
            />
          </label>
          <span className="portal-so-desktop contents">
          <PortalFilterSelect
            icon="folder"
            label="Projeto"
            value={kbProjeto}
            options={projetos
              .filter((p) => p.clienteId === effectiveCid && !p.arquivadoEm)
              .map((p) => ({ v: p.id, label: p.nome }))}
            onChange={setKbProjeto}
          />
          <PortalFilterSelect
            icon="calendar"
            label="Prazo"
            value={kbPrazo}
            options={[
              { v: 'atrasadas', label: 'Atrasadas' },
              { v: 'hoje', label: 'Hoje' },
              { v: 'semana', label: 'Próximos 7d' },
              { v: 'sem', label: 'Sem prazo' },
            ]}
            onChange={(v) => setKbPrazo(v as PrazoFiltro)}
          />
          <PortalPriMultiSelect selected={kbPrio} onToggle={toggleKbPrio} />
          </span>

          <button
            type="button"
            className={`fselect clear ${kbActive === 0 ? 'is-empty' : ''}`}
            onClick={kbActive > 0 ? clearFilters : undefined}
            disabled={kbActive === 0}
            title={kbActive > 0 ? `Limpar ${kbActive} filtro${kbActive > 1 ? 's' : ''}` : 'Nenhum filtro aplicado'}
            aria-label={kbActive > 0 ? `Limpar ${kbActive} filtros` : 'Sem filtros'}
          >
            <Icon name="x" size={14} className="ic" />
            <span
              className="font-mono"
              style={{ visibility: kbActive > 0 ? 'visible' : 'hidden' }}
              aria-hidden={kbActive === 0}
            >
              {kbActive > 0 ? kbActive : 0}
            </span>
          </button>
        </div>

        {viewerRole !== ROLE.CLIENTE && (
          <div className="portal-headerbar-switch">
            <select
              className="portal-header-switch-sel"
              value={portalClienteId}
              onChange={(e) => setPortalClienteId(e.target.value)}
              title="Trocar cliente"
            >
              {clientesAtivosExternos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>


      {showNewTask && effectiveCid && (
        <PortalNewTaskForm
          clienteId={effectiveCid}
          onClose={() => setShowNewTask(false)}
        />
      )}

      {/* Ação do cliente · lista os itens (antes o alerta só dava a contagem) */}
      {acaoItems.length > 0 && (
        <PortalAcaoBanner items={acaoItems} onOpenTask={openPortalTask} />
      )}

      {/* Visão qualitativa · caixas de IA (docs/portal-insights) */}
      <PortalIaBoxes clienteId={effectiveCid} />

      {/* 2. ALERTAS amigáveis */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.titulo} className={`portal-alert portal-alert-${a.severity}`}>
              <div className="portal-alert-icon">{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="portal-alert-title">{a.titulo}</div>
                {a.detalhe && <div className="portal-alert-sub">{a.detalhe}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. KPIs · alinhados com os do Backlog (v1.03.216).
             Total · Backlog · Em andamento · Bloqueadas · Atrasadas */}
      {(() => {
        const openTasks = portalTasks.filter((t) => t.status !== STATUS.CONCLUIDO);
        const kpi = {
          total: openTasks.length,
          backlog: openTasks.filter((t) => t.status === 'backlog').length,
          andamento: openTasks.filter((t) => t.status === 'andamento').length,
          bloqueadas: openTasks.filter((t) => t.status === 'bloqueado').length,
          atrasadas: openTasks.filter((t) => isAtrasada(t)).length,
        };
        return (
          <div className="hidden md:grid gap-3 md:grid-cols-5">
            <div className="portal-kpi">
              <div className="portal-kpi-label">Total ativas</div>
              <div className="portal-kpi-value">{kpi.total}</div>
            </div>
            <div className="portal-kpi">
              <div className="portal-kpi-label">Backlog</div>
              <div className="portal-kpi-value">{kpi.backlog}</div>
            </div>
            <div className="portal-kpi">
              <div className="portal-kpi-label">Em andamento</div>
              <div className="portal-kpi-value">{kpi.andamento}</div>
            </div>
            <div className={`portal-kpi ${kpi.bloqueadas > 0 ? 'portal-kpi-danger' : ''}`}>
              <div className="portal-kpi-label">Bloqueadas</div>
              <div className="portal-kpi-value">{kpi.bloqueadas}</div>
            </div>
            <div className={`portal-kpi ${kpi.atrasadas > 0 ? 'portal-kpi-danger' : ''}`}>
              <div className="portal-kpi-label">Atrasadas</div>
              <div className="portal-kpi-value">{kpi.atrasadas}</div>
            </div>
          </div>
        );
      })()}

      {/* Mobile · lista de cards no estilo do Backlog mobile interno */}
      <div className="md:hidden">
        <PortalMobileLista
          tasks={visibleTasks}
          pessoasById={pessoasById}
          projetosById={projetosById}
          onOpenTask={openPortalTask}
          qDraft={qDraft}
          setQDraft={setQDraft}
          projetoOpcoes={projetos
            .filter((p) => p.clienteId === effectiveCid && !p.arquivadoEm)
            .map((p) => ({ v: p.id, label: p.nome }))}
          projeto={kbProjeto}
          setProjeto={setKbProjeto}
          prazo={kbPrazo}
          setPrazo={setKbPrazo}
          prio={kbPrio}
          setPrio={setKbPrio}
          nFiltros={kbActive}
          limparFiltros={clearFilters}
        />
      </div>

      {/* Desktop · Kanban 5 colunas ou Lista */}
      <div className="hidden md:block">
      {view === 'kanban' ? (
        <PortalKanban
          tasks={visibleTasks}
          pessoasById={pessoasById}
          projetosById={projetosById}
          onOpenTask={openPortalTask}
          today={today}
        />
      ) : (
        <PortalLista
          tasks={visibleTasks}
          pessoasById={pessoasById}
          projetosById={projetosById}
          onOpenTask={openPortalTask}
          today={today}
        />
      )}
      </div>

      {/* Listas de prioridade removidas (v1.03.217) · info agora vive
          no Kanban 4 macros acima. */}


      <PortalTaskModal
        task={liveOpenTask}
        nomeResponsavel={liveOpenTask?.pessoaId ? nomes.get(liveOpenTask.pessoaId) ?? '' : ''}
        clienteNome={portalCliente?.nome ?? 'cliente'}
        onClose={closeModal}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Views · props compartilhadas
// ─────────────────────────────────────────────────────────

interface PortalViewProps {
  tasks: Task[];
  pessoasById: Map<string, { nome: string }>;
  projetosById: Map<string, { nome: string }>;
  onOpenTask: (t: Task) => void;
  today: string;
}

const ACAO_LABEL = { homologar: 'Homologar entrega', responder: 'Responder pendência' } as const;

function primeiroNome(pessoasById: Map<string, { nome: string }>, id: string): string {
  return id ? (pessoasById.get(id)?.nome ?? '').split(' ')[0] : '';
}

// ─────────────────────────────────────────────────────────
// PortalKanban · 5 colunas (filtros já aplicados no parent)
// ─────────────────────────────────────────────────────────

function PortalKanban({ tasks, pessoasById, projetosById, onOpenTask, today }: PortalViewProps) {
  const byCol = useMemo(() => {
    const m = Object.fromEntries(PORTAL_COLS.map((c) => [c.key, [] as Task[]])) as Record<PortalColKey, Task[]>;
    for (const t of tasks) {
      const col = SUB_TO_COL[t.subetapa];
      if (col) m[col].push(t);
    }
    return m;
  }, [tasks]);

  const desde = fmtDate(new Date(inicioMesAnteriorMs()).toISOString().slice(0, 10));

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-line">
        {PORTAL_COLS.map((col) => {
          const items = byCol[col.key];
          const pendentes = items.filter((t) => acaoDoCliente(t)).length;
          return (
            <div key={col.key} className="min-w-0">
              <div className="px-3 py-2 border-b border-line bg-[var(--surface-3)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{col.label}</span>
                  <span className="font-mono text-[10px] text-muted">{items.length}</span>
                </div>
                {/* 2ª linha sempre presente (vazia se não houver nada) pra
                    alinhar a altura dos cabeçalhos das 5 colunas */}
                {pendentes > 0 ? (
                  <div className="mt-0.5 text-[10px] font-semibold text-[color:var(--warn)]">
                    {pendentes} com ação sua
                  </div>
                ) : col.key === 'concluido' ? (
                  <div className="mt-0.5 text-[10px] text-muted">desde {desde}</div>
                ) : (
                  <div className="mt-0.5 text-[10px]" aria-hidden="true">&nbsp;</div>
                )}
              </div>
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {items.map((t) => {
                  const acao = acaoDoCliente(t);
                  const proj = projetosById.get(t.projetoId)?.nome ?? '';
                  const pess = primeiroNome(pessoasById, t.pessoaId);
                  const atras = !!(t.prazo && t.prazo < today && t.status !== STATUS.CONCLUIDO);
                  // Card compacto; com ação do cliente ganha a borda e o rodapé do mobile
                  return (
                    <div key={t.id} className={acao ? 'portal-mcard-acao' : undefined}>
                      <button
                        type="button"
                        onClick={() => onOpenTask(t)}
                        className="pk-card w-full text-left rounded-md border border-line bg-elev hover:bg-brand-tint p-2 transition-colors"
                      >
                        {/* Linha 1: título · Linha 2: projeto · subetapa ·
                            Linha 3: responsável · prioridade · prazo */}
                        <div className="text-xs font-medium text-ink break-words mb-1">{t.titulo}</div>
                        <div className="text-[10px] text-ink-soft font-mono mb-1 truncate">
                          {proj}
                          {proj && ' · '}
                          {SUB_LABELS[t.subetapa] ?? t.subetapa}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted font-mono">
                          {pess && <span className="truncate">{pess}</span>}
                          {t.prioridade && (
                            <span className={`pri pri-${t.prioridade} shrink-0`}>
                              <span className="pri-dot" />
                              {t.prioridade}
                            </span>
                          )}
                          {t.prazo && (
                            <span className={`ml-auto shrink-0 ${atras ? 'text-[var(--p0)] font-semibold' : ''}`}>
                              {fmtDataCurta(t.prazo)}
                            </span>
                          )}
                        </div>
                      </button>
                      {acao && <div className="portal-mcard-acao-tag">⚠ {ACAO_LABEL[acao]}</div>}
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-center py-4 text-[10px] italic text-muted">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PortalLista · tabela no padrão do Backlog
// ─────────────────────────────────────────────────────────

type SortKey = { key: string; dir: 'asc' | 'desc' };

/** asc → desc → remove; nova coluna vira o critério principal (mantém até 2). */
function proximaOrdem(cur: SortKey[], key: string): SortKey[] {
  const idx = cur.findIndex((s) => s.key === key);
  if (idx !== 0) return [{ key, dir: 'asc' }, ...cur.filter((s) => s.key !== key).slice(0, 2)];
  if (cur[0].dir === 'asc') return [{ key, dir: 'desc' }, ...cur.slice(1)];
  return cur.slice(1);
}

/** Ordena pelas chaves; sem chave mantém a ordem padrão do portal. */
function ordenarPortal(
  tasks: Task[],
  sortKeys: SortKey[],
  projetosById: Map<string, { nome: string }>,
  pessoasById: Map<string, { nome: string }>,
): Task[] {
  if (sortKeys.length === 0) return tasks;
  const val = (t: Task, k: string): number | string => {
    if (k === 'titulo') return t.titulo.toLowerCase();
    if (k === 'projeto') return (projetosById.get(t.projetoId)?.nome ?? '').toLowerCase();
    if (k === 'subetapa') return SUBS_FLAT_ORDER[t.subetapa] ?? 99;
    if (k === 'pessoa') return (pessoasById.get(t.pessoaId)?.nome ?? '').toLowerCase();
    if (k === 'prioridade') return t.prioridade ? +t.prioridade.slice(1) : 99;
    if (k === 'prazo') return t.prazo || '9999';
    return '';
  };
  return [...tasks].sort((a, b) => {
    for (const { key, dir } of sortKeys) {
      const mul = dir === 'asc' ? 1 : -1;
      const av = val(a, key);
      const bv = val(b, key);
      if (av < bv) return -mul;
      if (av > bv) return mul;
    }
    return 0;
  });
}

function PortalLista({ tasks, pessoasById, projetosById, onOpenTask, today }: PortalViewProps) {
  // Mesmo mecanismo do Backlog: clique ordena asc → desc → remove; nova
  // coluna vira o critério principal e mantém até 2 anteriores. Sem
  // critério, vale a ordem padrão do portal (já aplicada no parent).
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const sortBy = (key: string) => setSortKeys((cur) => proximaOrdem(cur, key));
  const sortIcon = (key: string): string => {
    const idx = sortKeys.findIndex((s) => s.key === key);
    if (idx === -1) return '';
    const arrow = sortKeys[idx].dir === 'asc' ? '▲' : '▼';
    return sortKeys.length > 1 ? `${arrow}${idx + 1}` : arrow;
  };

  const sorted = useMemo(
    () => ordenarPortal(tasks.filter((t) => t.status !== STATUS.CONCLUIDO), sortKeys, projetosById, pessoasById),
    [tasks, sortKeys, projetosById, pessoasById],
  );

  const th = (label: string, key: string, style?: React.CSSProperties) => (
    <th className="sortable" onClick={() => sortBy(key)} style={style}>
      {label} <span className="text-[10px] ml-1 text-ink">{sortIcon(key)}</span>
    </th>
  );

  return (
    <div className="card tbl-wrap overflow-x-auto">
      <table className="tbl">
        <colgroup>
          <col />
          <col style={{ width: 180 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            {th('Tarefa', 'titulo')}
            {th('Projeto', 'projeto')}
            {th('Subetapa', 'subetapa')}
            {th('Responsável', 'pessoa')}
            {th('Prio', 'prioridade')}
            {th('Prazo', 'prazo', { paddingRight: 24 })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const acao = acaoDoCliente(t);
            const atras = !!(t.prazo && t.prazo < today && t.status !== STATUS.CONCLUIDO);
            return (
              <tr key={t.id} className="cursor-pointer hover:bg-brand-tint" onClick={() => onOpenTask(t)}>
                <td>
                  <div className="tbl-title" title={t.titulo}>{t.titulo}</div>
                  {acao && (
                    <div className="text-[10px] font-semibold text-[color:var(--warn)]">
                      ⚠ {ACAO_LABEL[acao]}
                    </div>
                  )}
                </td>
                <td className="truncate text-ink-soft">{projetosById.get(t.projetoId)?.nome ?? '—'}</td>
                <td className="truncate text-ink-soft">{SUB_LABELS[t.subetapa] ?? t.subetapa}</td>
                <td className="truncate text-ink-soft">{primeiroNome(pessoasById, t.pessoaId) || '—'}</td>
                <td>
                  {t.prioridade ? (
                    <span className={`pri pri-${t.prioridade}`}>
                      <span className="pri-dot" />
                      {t.prioridade}
                    </span>
                  ) : '—'}
                </td>
                <td
                  className={`font-mono ${atras ? 'text-[var(--p0)] font-semibold' : 'text-ink-soft'}`}
                  style={{ paddingRight: 24 }}
                >
                  {t.prazo ? fmtDataCurta(t.prazo) : '—'}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-xs italic text-muted py-6">
                Nenhuma tarefa com esses filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PortalMobileLista · cards no estilo do Backlog mobile interno
// ─────────────────────────────────────────────────────────

type FiltroMobile = 'abertas' | 'acao' | 'concluidas' | 'todas';

interface PortalMobileProps extends Omit<PortalViewProps, 'today'> {
  qDraft: string;
  setQDraft: (v: string) => void;
  projetoOpcoes: { v: string; label: string }[];
  projeto: string;
  setProjeto: (v: string) => void;
  prazo: PrazoFiltro;
  setPrazo: (v: PrazoFiltro) => void;
  prio: Set<string>;
  setPrio: (v: Set<string>) => void;
  nFiltros: number;
  limparFiltros: () => void;
}

/** Mesmo padrão do Backlog mobile: busca + botão de filtros (sheet com
 *  filtro e ordenação por linha) + X que limpa filtros e ordenação. */
function PortalMobileLista(props: PortalMobileProps) {
  const { tasks, pessoasById, projetosById, onOpenTask, qDraft, setQDraft, nFiltros, limparFiltros } = props;
  const [status, setStatus] = useState<FiltroMobile>('abertas');
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);

  const lista = useMemo(() => {
    const porStatus = tasks.filter((t) => {
      const concluida = t.status === STATUS.CONCLUIDO;
      if (status === 'abertas') return !concluida;
      if (status === 'acao') return !concluida && !!acaoDoCliente(t);
      if (status === 'concluidas') return concluida;
      return true;
    });
    return ordenarPortal(porStatus, sortKeys, projetosById, pessoasById);
  }, [tasks, status, sortKeys, projetosById, pessoasById]);

  const nActive = nFiltros + (status !== 'abertas' ? 1 : 0) + sortKeys.length;
  const limpar = () => {
    limparFiltros();
    setStatus('abertas');
    setSortKeys([]);
  };

  return (
    <div>
      <div className="m-filterbar">
        <label className="m-search">
          <Icon name="search" size={16} className="ic" />
          <input
            type="text"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Buscar tudo…"
            style={{ fontSize: 16 }}
          />
        </label>
        <button
          type="button"
          className={`m-fbtn ${nActive > 0 ? 'on' : ''}`}
          onClick={() => setSheetOpen(true)}
          aria-label="Abrir filtros"
        >
          <Icon name="filter" size={16} />
        </button>
        <button
          type="button"
          className={`m-clr ${nActive === 0 ? 'is-empty' : ''}`}
          disabled={nActive === 0}
          onClick={limpar}
          title={nActive > 0 ? `Limpar ${nActive} filtro${nActive > 1 ? 's' : ''} e ordenação` : 'Nenhum filtro aplicado'}
          aria-label={nActive > 0 ? `Limpar ${nActive} filtros` : 'Sem filtros'}
        >
          <Icon name="x" size={15} />
          <span className="font-mono" style={{ visibility: nActive > 0 ? 'visible' : 'hidden' }} aria-hidden={nActive === 0}>
            {nActive > 0 ? nActive : 0}
          </span>
        </button>
      </div>

      <div className="m-list">
        {lista.length === 0 ? (
          <div className="card text-center py-8 px-4 text-sm text-muted">
            {status === 'acao' ? 'Nada esperando você agora.' : 'Nenhuma tarefa com esses filtros.'}
          </div>
        ) : (
          lista.map((t) => {
            const acao = acaoDoCliente(t);
            return (
              <div key={t.id} className={acao ? 'portal-mcard-acao' : undefined}>
                <TaskCard
                  task={t}
                  cliente={projetosById.get(t.projetoId)?.nome ?? '—'}
                  projeto={SUB_LABELS[t.subetapa] ?? t.subetapa}
                  respNome={pessoasById.get(t.pessoaId)?.nome ?? ''}
                  size="md"
                  onClick={() => onOpenTask(t)}
                />
                {acao && <div className="portal-mcard-acao-tag">⚠ {ACAO_LABEL[acao]}</div>}
              </div>
            );
          })
        )}
      </div>

      {sheetOpen && createPortal(
        <PortalFilterSheet
          {...props}
          status={status}
          sortKeys={sortKeys}
          onClose={() => setSheetOpen(false)}
          onApply={(v) => {
            setStatus(v.status);
            props.setProjeto(v.projeto);
            props.setPrazo(v.prazo);
            props.setPrio(v.prio ? new Set([v.prio]) : new Set());
            setSheetOpen(false);
          }}
          onClear={() => {
            limpar();
            setSheetOpen(false);
          }}
          sortBy={(k) => setSortKeys((cur) => proximaOrdem(cur, k))}
        />,
        // Fora do fade-up (transform quebra o position: fixed do sheet)
        document.body,
      )}
    </div>
  );
}

function PortalFilterSheet({
  status,
  projeto,
  prazo,
  prio,
  projetoOpcoes,
  sortKeys,
  sortBy,
  onClose,
  onApply,
  onClear,
}: PortalMobileProps & {
  status: FiltroMobile;
  sortKeys: SortKey[];
  sortBy: (k: string) => void;
  onClose: () => void;
  onApply: (v: { status: FiltroMobile; projeto: string; prazo: PrazoFiltro; prio: string }) => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState({
    status,
    projeto,
    prazo,
    // No celular a prioridade é escolha única; mantém a primeira se havia várias
    prio: prio.size > 0 ? [...prio].sort()[0] : '',
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const icone = (key: string) => {
    const sk = sortKeys[0];
    if (!sk || sk.key !== key) return 'sort' as const;
    return sk.dir === 'asc' ? ('arrow-up' as const) : ('arrow-down' as const);
  };
  const botaoOrdem = (key: string, rotulo: string) => (
    <button
      type="button"
      className={`m-sort-btn ${sortKeys[0]?.key === key ? 'on' : ''}`}
      onClick={() => sortBy(key)}
      aria-label={`Ordenar por ${rotulo}`}
    >
      <Icon name={icone(key)} size={14} />
    </button>
  );

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros do portal">
        <div className="grab" />
        <h2>Filtros e ordem</h2>
        <div className="sh-sub">toque no valor para filtrar · ↑↓ para ordenar</div>

        <div className="m-group">
          <div className="m-row">
            <span className="ric"><Icon name="list-filter" size={16} /></span>
            <div className="rbody"><div className="rt">Status</div></div>
            <select
              className="m-select"
              value={local.status}
              onChange={(e) => setLocal({ ...local, status: e.target.value as FiltroMobile })}
            >
              <option value="abertas">Abertas</option>
              <option value="acao">Aguardando você</option>
              <option value="concluidas">Concluídas</option>
              <option value="todas">Todas</option>
            </select>
            {botaoOrdem('subetapa', 'status')}
          </div>

          <div className="m-row">
            <span className="ric"><Icon name="folder" size={16} /></span>
            <div className="rbody"><div className="rt">Projeto</div></div>
            <select
              className="m-select"
              value={local.projeto}
              onChange={(e) => setLocal({ ...local, projeto: e.target.value })}
            >
              <option value="">Todos</option>
              {projetoOpcoes.map((p) => (
                <option key={p.v} value={p.v}>{p.label}</option>
              ))}
            </select>
            {botaoOrdem('projeto', 'projeto')}
          </div>

          <div className="m-row">
            <span className="ric"><Icon name="alert" size={16} /></span>
            <div className="rbody"><div className="rt">Prioridade</div></div>
            <select
              className="m-select"
              value={local.prio}
              onChange={(e) => setLocal({ ...local, prio: e.target.value })}
            >
              <option value="">Todas</option>
              {PRIO_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {botaoOrdem('prioridade', 'prioridade')}
          </div>

          <div className="m-row">
            <span className="ric"><Icon name="calendar" size={16} /></span>
            <div className="rbody"><div className="rt">Prazo</div></div>
            <select
              className="m-select"
              value={local.prazo}
              onChange={(e) => setLocal({ ...local, prazo: e.target.value as PrazoFiltro })}
            >
              <option value="">Qualquer</option>
              <option value="atrasadas">Atrasadas</option>
              <option value="hoje">Hoje</option>
              <option value="semana">Próximos 7 dias</option>
              <option value="sem">Sem prazo</option>
            </select>
            {botaoOrdem('prazo', 'prazo')}
          </div>
        </div>

        <div className="filter-actions">
          <button type="button" className="btn" onClick={onClear}>Limpar</button>
          <button type="button" className="btn btn-primary" onClick={() => onApply(local)}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PortalAcaoBanner · itens que esperam o cliente
// ─────────────────────────────────────────────────────────

function PortalAcaoBanner({ items, onOpenTask }: { items: Task[]; onOpenTask: (t: Task) => void }) {
  const [expandido, setExpandido] = useState(false);
  const [aberta, alternar] = useSecaoAberta();
  const visiveis = expandido ? items : items.slice(0, 3);
  const agora = Date.now();
  return (
    <div className="portal-alert portal-alert-alta">
      <div className="min-w-0 flex-1">
        <CabecalhoRecolher aberta={aberta} onClick={alternar}>
          <span className="portal-alert-title">
            {items.length === 1 ? '1 item aguardando você' : `${items.length} itens aguardando você`}
          </span>
        </CabecalhoRecolher>
        {aberta && (<>
        <div className="mt-2 space-y-1">
          {visiveis.map((t) => {
            const acao = acaoDoCliente(t)!;
            const dias = t.subetapaEm ? Math.max(0, Math.floor((agora - t.subetapaEm) / 86400000)) : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpenTask(t)}
                className="portal-acao-item flex w-full items-baseline gap-2 text-left text-sm hover:underline"
              >
                <span className="hidden md:inline shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
                  {ACAO_LABEL[acao]}
                </span>
                <span className="portal-acao-link min-w-0 truncate font-medium">{t.titulo}</span>
                {dias != null && dias > 0 && (
                  <span className="hidden md:inline shrink-0 font-mono text-[10px] text-muted">há {dias}d</span>
                )}
              </button>
            );
          })}
        </div>
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="mt-1 text-xs text-ink-soft underline"
          >
            {expandido ? 'Mostrar menos' : `Ver todos (${items.length})`}
          </button>
        )}
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PortalFilterSelect · single-select droplist (reusa .fselect)
// ─────────────────────────────────────────────────────────

interface PortalFSProps {
  icon?: Parameters<typeof Icon>[0]['name'];
  label: string;
  value: string;
  options: ReadonlyArray<{ v: string; label: string }>;
  onChange: (v: string) => void;
}

function PortalFilterSelect({ icon, label, value, options, onChange }: PortalFSProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(() => setOpen(false));
  const cur = options.find((o) => o.v === value);
  return (
    <span className="fs-wrap" ref={ref}>
      <button
        type="button"
        className={`fselect ${value ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} size={14} className="ic" />}
        <span>{value ? cur?.label ?? label : label}</span>
        <Icon name="chevron-down" size={14} className="ic" />
      </button>
      {open && (
        <div className="fmenu">
          <button
            type="button"
            className={!value ? 'sel' : ''}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            <span className="grow">Todos</span>
            {!value && <Icon name="check" size={14} />}
          </button>
          <div className="fmenu-div" />
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              className={value === o.v ? 'sel' : ''}
              onClick={() => { onChange(o.v); setOpen(false); }}
            >
              <span className="grow">{o.label}</span>
              {value === o.v && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// PortalPriMultiSelect · multiselect droplist pra P0-P3
// ─────────────────────────────────────────────────────────

function PortalPriMultiSelect({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (p: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(() => setOpen(false));
  const count = selected.size;
  const label =
    count === 0
      ? 'Prioridade'
      : count === 1
        ? Array.from(selected)[0]
        : `Prioridade · ${count}`;
  return (
    <span className="fs-wrap" ref={ref}>
      <button
        type="button"
        className={`fselect ${count > 0 ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="flag" size={14} className="ic" />
        <span>{label}</span>
        <Icon name="chevron-down" size={14} className="ic" />
      </button>
      {open && (
        <div className="fmenu">
          {PRIO_OPTIONS.map((p) => {
            const on = selected.has(p);
            return (
              <button
                key={p}
                type="button"
                className={on ? 'sel' : ''}
                onClick={() => onToggle(p)}
              >
                <span className={`pri pri-${p} mr-2`} style={{ opacity: on ? 1 : 0.5 }}>
                  <span className="pri-dot" />
                  {p}
                </span>
                <span className="grow" />
                {on && <Icon name="check" size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
