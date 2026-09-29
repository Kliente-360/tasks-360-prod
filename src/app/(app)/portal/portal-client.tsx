'use client';

/**
 * Portal cliente · UI principal.
 * Portado de index.html (section x-show="tab==='portal'", linhas 1707-1890)
 * + lib/views/portal.js + lib/views/utilities.js (effectivePortalClienteId).
 *
 * Composição:
 * - Setup banner (admin/interno escolhem cliente · cliente não-vinculado vê aviso)
 * - Header verde Kliente com switch discreto (admin/interno)
 * - Alertas amigáveis
 * - 4 KPIs (entregues mês, andamento, aguardando você, próxima entrega)
 * - Storytelling: ritmo 6 meses + distribuição por projeto + lead time
 * - 4 listas (aguardando, andamento, próximas, recentes)
 * - Modal de task ao clicar num card
 *
 * Cliente externo (role='cliente'): cid vem de currentPessoa.cliente_id, sem
 * opção de simular. Admin/interno: cid livre, persistido em localStorage.
 */

import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import { ROLE, STATUS, SUB_LABELS, SUB_TO_MACRO } from '@/lib/task-constants';
import { atrasada as isAtrasada } from '@/lib/task-utils';
import { fmtDate } from '@/lib/format';
import type { Task } from '@/lib/types';
import { usePortalData, type PortalCards } from './use-portal-data';
import { PortalTaskModal } from './portal-task-modal';
import { PortalNewTaskForm } from './portal-new-task-form';

/** 4 colunas macro do Kanban do Portal (jul/2026 · v1.03.216). */
const KANBAN_MACROS = [
  { key: 'backlog',   label: 'Backlog',    tone: 'muted' },
  { key: 'andamento', label: 'Em andamento', tone: 'brand' },
  { key: 'bloqueado', label: 'Bloqueado',  tone: 'warn' },
  { key: 'concluido', label: 'Concluído',  tone: 'success' },
] as const;

const PRIO_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;

const LS_KEY = 'kliente360-portal-cliente';

type CardKey = keyof PortalCards;
interface CardConfig {
  key: CardKey;
  title: string;
  empty: string;
  tone: 'danger' | 'neutral' | 'success';
}
const CARDS: CardConfig[] = [
  { key: 'aguardando', title: 'Aguardando você', empty: 'Nada esperando sua resposta. Tudo certo!', tone: 'danger' },
  { key: 'emAndamento', title: 'Em andamento agora', empty: 'Nada em andamento no momento.', tone: 'neutral' },
  { key: 'proximas', title: 'Próximas entregas (14d)', empty: 'Sem datas marcadas pros próximos 14 dias.', tone: 'neutral' },
  { key: 'recentes', title: 'Entregues recentemente', empty: 'Sem entregas recentes.', tone: 'success' },
];

export function PortalClient() {
  const { clientes, projetos, pessoas, currentPessoa, viewerRole } = useData();

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

  const { portalTasks, cards, metrics, alerts, headline } = usePortalData(effectiveCid);

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

  // Filtros do Kanban do portal
  const [kbProjeto, setKbProjeto] = useState('');
  const [kbSubetapa, setKbSubetapa] = useState('');
  const [kbPrazo, setKbPrazo] = useState<'' | 'atrasadas' | 'hoje' | 'semana' | 'sem'>('');
  const [kbPrio, setKbPrio] = useState<Set<string>>(new Set());
  const toggleKbPrio = (p: string) => {
    setKbPrio((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const openPortalTask = (t: Task) => {
    // Defesa em profundidade: garante que a task pertence ao cliente
    // e é visível. RLS já bloqueia no banco; este guard evita race conditions
    // (ex: realtime entregando task antes da filtragem).
    if (!t || t.clienteId !== effectiveCid || t.visivelCliente === false || t.arquivadoEm) {
      return;
    }
    setOpenTask(t);
  };

  // Lookups
  const projetosById = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);
  const pessoasById = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

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
    <div className="fade-up space-y-5 md:space-y-6">
      {/* 1. HEADER · cor + texto customizáveis por cliente (cadastro do cliente) */}
      <div
        className={`portal-header relative${
          portalCliente?.corPortalTexto === 'dark' ? ' theme-dark-text' : ''
        }`}
        style={
          portalCliente?.corPortal
            ? { background: portalCliente.corPortal }
            : undefined
        }
      >
        <div className="portal-header-eyebrow">Portal · Kliente 360</div>
        <div className="portal-header-name">{portalCliente?.nome ?? ''}</div>
        <div className="portal-header-sub">{headline}</div>
        {viewerRole !== ROLE.CLIENTE && (
          <div className="portal-header-switch">
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
        {/* Botão "+ Nova solicitação" foi movido pro header
            (v1.03.216) · dispara o form via evento portal:new-task. */}
      </div>

      {showNewTask && effectiveCid && (
        <PortalNewTaskForm
          clienteId={effectiveCid}
          onClose={() => setShowNewTask(false)}
        />
      )}

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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
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

      {/* 4. KANBAN 4 macros · substitui os gráficos antigos (v1.03.216).
          Filtros: projeto · subetapa · prazo · prioridade (multiselect). */}
      <PortalKanban
        tasks={portalTasks}
        projetos={projetos.filter((p) => p.clienteId === effectiveCid && !p.arquivadoEm)}
        pessoasById={pessoasById}
        projetosById={projetosById}
        onOpenTask={openPortalTask}
        kbProjeto={kbProjeto} setKbProjeto={setKbProjeto}
        kbSubetapa={kbSubetapa} setKbSubetapa={setKbSubetapa}
        kbPrazo={kbPrazo} setKbPrazo={setKbPrazo}
        kbPrio={kbPrio} toggleKbPrio={toggleKbPrio}
      />

      {/* 5. LISTAS de prioridade */}
      {CARDS.map((card) => {
        const items = cards[card.key];
        const isDanger = card.tone === 'danger' && items.length > 0;
        return (
          <div key={card.key} className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 md:px-5">
              <div
                className={`font-brand text-sm font-semibold ${
                  isDanger ? 'text-[color:var(--p0)]' : ''
                }`}
              >
                {card.title}
              </div>
              <span className="font-mono text-xs text-muted">{items.length} item(s)</span>
            </div>
            {items.map((t) => {
              const proj = projetosById.get(t.projetoId)?.nome ?? '';
              const pess = t.pessoaId
                ? (pessoasById.get(t.pessoaId)?.nome ?? '').split(' ')[0]
                : '';
              const aguardandoCli =
                t.subetapa === 'bloqueado' && t.bloqueadoPor === 'cliente';
              return (
                <div
                  key={t.id}
                  className="flex cursor-pointer items-center justify-between gap-3 border-b border-line px-4 py-3 transition-colors last:border-0 hover:bg-brand-tint md:px-5"
                  onClick={() => openPortalTask(t)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{t.titulo}</div>
                    <div className="mt-1 text-xs text-muted">
                      {proj}
                      {pess && ` · ${pess}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {t.prazo && (
                      <div className="font-mono text-xs text-ink-soft">
                        {fmtDate(t.prazo)}
                      </div>
                    )}
                    {t.status === STATUS.CONCLUIDO && (
                      <div
                        className="mt-0.5 font-mono text-[10px]"
                        style={{ color: 'var(--brand-dark)' }}
                      >
                        ✓ entregue
                      </div>
                    )}
                    {aguardandoCli && (
                      <div
                        className="mt-0.5 font-mono text-[10px]"
                        style={{ color: 'var(--p0)' }}
                      >
                        ⚠ aguardando você
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="px-4 py-6 text-center text-xs italic text-muted md:px-5">
                {card.empty}
              </div>
            )}
          </div>
        );
      })}

      {/* 6. Seções IA · placeholders (v1.03.216).
             Conteúdo virá de rotinas agendadas depois. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <PortalIaPlaceholder
          title="Entregas de valor no mês anterior"
          hint="Sumário narrativo do que foi entregue e do impacto gerado."
        />
        <PortalIaPlaceholder
          title="Riscos no backlog atual"
          hint="Análise de o que pode atrasar ou bloquear as próximas entregas."
        />
      </div>

      <PortalTaskModal
        task={openTask}
        clienteNome={portalCliente?.nome ?? 'cliente'}
        onClose={closeModal}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// PortalKanban · 4 colunas macro + filtros
// ─────────────────────────────────────────────────────────

interface PortalKanbanProps {
  tasks: Task[];
  projetos: Array<{ id: string; nome: string }>;
  pessoasById: Map<string, { nome: string }>;
  projetosById: Map<string, { nome: string }>;
  onOpenTask: (t: Task) => void;
  kbProjeto: string; setKbProjeto: (v: string) => void;
  kbSubetapa: string; setKbSubetapa: (v: string) => void;
  kbPrazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
  setKbPrazo: (v: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem') => void;
  kbPrio: Set<string>;
  toggleKbPrio: (p: string) => void;
}

function PortalKanban({
  tasks, projetos, pessoasById, projetosById, onOpenTask,
  kbProjeto, setKbProjeto, kbSubetapa, setKbSubetapa,
  kbPrazo, setKbPrazo, kbPrio, toggleKbPrio,
}: PortalKanbanProps) {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7Iso = in7.toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (kbProjeto && t.projetoId !== kbProjeto) return false;
      if (kbSubetapa && t.subetapa !== kbSubetapa) return false;
      if (kbPrio.size > 0 && !kbPrio.has(t.prioridade || '')) return false;
      if (kbPrazo === 'atrasadas' && !(t.prazo && t.status !== STATUS.CONCLUIDO && t.prazo < today)) return false;
      if (kbPrazo === 'hoje' && t.prazo !== today) return false;
      if (kbPrazo === 'semana' && !(t.prazo && t.prazo >= today && t.prazo <= in7Iso)) return false;
      if (kbPrazo === 'sem' && t.prazo) return false;
      return true;
    });
  }, [tasks, kbProjeto, kbSubetapa, kbPrio, kbPrazo, today, in7Iso]);

  const byMacro = useMemo(() => {
    const m: Record<string, Task[]> = { backlog: [], andamento: [], bloqueado: [], concluido: [] };
    for (const t of filtered) {
      const macro = SUB_TO_MACRO[t.subetapa] ?? t.status;
      if (m[macro]) m[macro].push(t);
    }
    // ordena cada coluna: atrasadas primeiro → prio → prazo asc
    const pr: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3, '': 9 };
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => {
        const aa = a.prazo && a.prazo < today && a.status !== STATUS.CONCLUIDO ? 0 : 1;
        const bb = b.prazo && b.prazo < today && b.status !== STATUS.CONCLUIDO ? 0 : 1;
        if (aa !== bb) return aa - bb;
        const pd = (pr[a.prioridade] ?? 9) - (pr[b.prioridade] ?? 9);
        if (pd !== 0) return pd;
        return (a.prazo || '9999') < (b.prazo || '9999') ? -1 : 1;
      });
    }
    return m;
  }, [filtered, today]);

  const anyFilter = !!(kbProjeto || kbSubetapa || kbPrazo || kbPrio.size > 0);

  return (
    <div className="card overflow-hidden">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 md:px-4">
        <select
          className="inp text-xs"
          value={kbProjeto}
          onChange={(e) => setKbProjeto(e.target.value)}
        >
          <option value="">Projeto · todos</option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <select
          className="inp text-xs"
          value={kbSubetapa}
          onChange={(e) => setKbSubetapa(e.target.value)}
        >
          <option value="">Subetapa · todas</option>
          {Object.entries(SUB_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          className="inp text-xs"
          value={kbPrazo}
          onChange={(e) => setKbPrazo(e.target.value as PortalKanbanProps['kbPrazo'])}
        >
          <option value="">Prazo · qualquer</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="hoje">Hoje</option>
          <option value="semana">Próximos 7d</option>
          <option value="sem">Sem prazo</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted mr-1">Prioridade:</span>
          {PRIO_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleKbPrio(p)}
              className={`pri pri-${p} ${kbPrio.has(p) ? '' : 'opacity-40'} cursor-pointer`}
              aria-pressed={kbPrio.has(p)}
              title={`Filtrar ${p}`}
            >
              <span className="pri-dot" />
              {p}
            </button>
          ))}
        </div>
        {anyFilter && (
          <button
            type="button"
            onClick={() => {
              setKbProjeto(''); setKbSubetapa(''); setKbPrazo('');
              PRIO_OPTIONS.forEach((p) => { if (kbPrio.has(p)) toggleKbPrio(p); });
            }}
            className="text-xs text-ink-soft hover:text-ink underline ml-auto"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Colunas */}
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line">
        {KANBAN_MACROS.map((col) => {
          const items = byMacro[col.key] ?? [];
          return (
            <div key={col.key} className="min-w-0">
              <div className="px-3 py-2 md:px-4 border-b border-line flex items-center justify-between bg-[var(--surface-3)]">
                <span className="text-xs font-semibold text-ink">{col.label}</span>
                <span className="font-mono text-[10px] text-muted">{items.length}</span>
              </div>
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {items.map((t) => {
                  const proj = projetosById.get(t.projetoId)?.nome ?? '';
                  const pess = t.pessoaId
                    ? (pessoasById.get(t.pessoaId)?.nome ?? '').split(' ')[0]
                    : '';
                  const atras = !!(t.prazo && t.prazo < today && t.status !== STATUS.CONCLUIDO);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTask(t)}
                      className="w-full text-left rounded-md border border-line bg-elev hover:bg-brand-tint p-2 transition-colors"
                    >
                      <div className="flex items-start gap-2 mb-1">
                        {t.prioridade && (
                          <span className={`pri pri-${t.prioridade} shrink-0`}>
                            <span className="pri-dot" />
                            {t.prioridade}
                          </span>
                        )}
                        <span className="text-xs font-medium text-ink break-words">
                          {t.titulo}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted font-mono">
                        {proj}
                        {pess && ` · ${pess}`}
                        {t.prazo && (
                          <span className={atras ? ' text-[var(--p0)] font-semibold' : ''}>
                            {' · '}{fmtDate(t.prazo)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-center py-4 text-[10px] italic text-muted">
                    —
                  </div>
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
// PortalIaPlaceholder · seção com "em breve"
// ─────────────────────────────────────────────────────────

function PortalIaPlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card p-4 md:p-5 border-dashed">
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-brand text-sm font-semibold text-ink">{title}</div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
          em breve
        </span>
      </div>
      <div className="text-xs text-muted italic">{hint}</div>
    </div>
  );
}
