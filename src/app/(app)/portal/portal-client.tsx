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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/lib/data-store';
import { ROLE, STATUS, SUB_LABELS, SUB_TO_MACRO } from '@/lib/task-constants';
import { atrasada as isAtrasada } from '@/lib/task-utils';
import { fmtDate } from '@/lib/format';
import type { Task } from '@/lib/types';
import { usePortalData } from './use-portal-data';
import { PortalTaskModal } from './portal-task-modal';
import { PortalNewTaskForm } from './portal-new-task-form';
import { Icon } from '@/components/icons';
import { useClickAway } from '@/lib/use-click-away';

/** 4 colunas macro do Kanban do Portal (jul/2026 · v1.03.216). */
const KANBAN_MACROS = [
  { key: 'backlog',   label: 'Backlog',    tone: 'muted' },
  { key: 'andamento', label: 'Em andamento', tone: 'brand' },
  { key: 'bloqueado', label: 'Bloqueado',  tone: 'warn' },
  { key: 'concluido', label: 'Concluído',  tone: 'success' },
] as const;

const PRIO_OPTIONS = ['P0', 'P1', 'P2', 'P3'] as const;

const LS_KEY = 'kliente360-portal-cliente';

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

  const { portalTasks, alerts, headline } = usePortalData(effectiveCid);

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
  const kbActive =
    (kbProjeto ? 1 : 0) +
    (kbSubetapa ? 1 : 0) +
    (kbPrazo ? 1 : 0) +
    (kbPrio.size > 0 ? 1 : 0);

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
            icon="list-filter"
            label="Subetapa"
            value={kbSubetapa}
            options={Object.entries(SUB_LABELS).map(([k, v]) => ({ v: k, label: v }))}
            onChange={setKbSubetapa}
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
            onChange={(v) => setKbPrazo(v as typeof kbPrazo)}
          />
          <PortalPriMultiSelect selected={kbPrio} onToggle={toggleKbPrio} />

          <button
            type="button"
            className={`fselect clear ${kbActive === 0 ? 'is-empty' : ''}`}
            onClick={
              kbActive > 0
                ? () => {
                    setKbProjeto('');
                    setKbSubetapa('');
                    setKbPrazo('');
                    PRIO_OPTIONS.forEach((p) => {
                      if (kbPrio.has(p)) toggleKbPrio(p);
                    });
                  }
                : undefined
            }
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

      {/* headline (sub-linha antiga) fica logo abaixo do header colorido */}
      {headline && (
        <div className="text-xs text-muted -mt-2">{headline}</div>
      )}

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
        pessoasById={pessoasById}
        projetosById={projetosById}
        onOpenTask={openPortalTask}
        kbProjeto={kbProjeto}
        kbSubetapa={kbSubetapa}
        kbPrazo={kbPrazo}
        kbPrio={kbPrio}
      />

      {/* Listas de prioridade removidas (v1.03.217) · info agora vive
          no Kanban 4 macros acima. */}

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
  pessoasById: Map<string, { nome: string }>;
  projetosById: Map<string, { nome: string }>;
  onOpenTask: (t: Task) => void;
  kbProjeto: string;
  kbSubetapa: string;
  kbPrazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
  kbPrio: Set<string>;
}

function PortalKanban({
  tasks, pessoasById, projetosById, onOpenTask,
  kbProjeto, kbSubetapa, kbPrazo, kbPrio,
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

  return (
    <div className="card overflow-hidden">
      {/* Filtros vivem no header colorido acima (v1.03.219) */}
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
