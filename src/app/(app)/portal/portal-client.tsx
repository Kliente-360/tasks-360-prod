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
import { ROLE, STATUS } from '@/lib/task-constants';
import { fmtDate } from '@/lib/format';
import type { Task } from '@/lib/types';
import { usePortalData, type PortalCards } from './use-portal-data';
import { PortalTaskModal } from './portal-task-modal';
import { PortalNewTaskForm } from './portal-new-task-form';

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

  const { cards, metrics, alerts, headline } = usePortalData(effectiveCid);

  // Modal state
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const closeModal = () => setOpenTask(null);
  // 3.D · estado do form "Nova solicitação"
  const [showNewTask, setShowNewTask] = useState(false);

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
        {/* 3.D · botão "Nova solicitação" — cliente abre task que cai
            na Triagem do time (não direto no Backlog). */}
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="absolute right-3 bottom-3 md:right-5 md:bottom-5 px-3 py-2 rounded-md text-sm font-medium shadow-sm"
          style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--brand-dark)' }}
        >
          + Nova solicitação
        </button>
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

      {/* 3. KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="portal-kpi">
          <div className="portal-kpi-label">Entregues este mês</div>
          <div className="portal-kpi-value">{metrics.mesAtual}</div>
          {metrics.mesAnterior > 0 && (
            <div className="portal-kpi-delta">
              <span
                className={
                  metrics.mesAtual >= metrics.mesAnterior
                    ? 'text-[color:var(--green)]'
                    : 'text-ink-soft'
                }
              >
                {(metrics.mesAtual >= metrics.mesAnterior ? '↑' : '↓') +
                  ' vs ' +
                  metrics.mesAnterior +
                  ' no mês anterior'}
              </span>
            </div>
          )}
          {metrics.mesAnterior === 0 && metrics.mesAtual === 0 && (
            <div className="portal-kpi-delta text-muted">Sem histórico recente.</div>
          )}
        </div>
        <div className="portal-kpi">
          <div className="portal-kpi-label">Em andamento</div>
          <div className="portal-kpi-value">{cards.emAndamento.length}</div>
          <div className="portal-kpi-delta text-muted">
            {metrics.totalAtivas} ativa(s) no total
          </div>
        </div>
        <div
          className={`portal-kpi ${cards.aguardando.length > 0 ? 'portal-kpi-danger' : ''}`}
        >
          <div className="portal-kpi-label">Aguardando você</div>
          <div className="portal-kpi-value">{cards.aguardando.length}</div>
          {cards.aguardando.length === 0 && (
            <div className="portal-kpi-delta">Nada pendente.</div>
          )}
          {cards.aguardando.length > 0 && metrics.aguardandoAgingMax > 0 && (
            <div className="portal-kpi-delta">
              +{metrics.aguardandoAgingMax}d na mais antiga
            </div>
          )}
        </div>
        <div className="portal-kpi">
          <div className="portal-kpi-label">Próxima entrega</div>
          {metrics.diasAteProxima != null ? (
            <div className="portal-kpi-value">
              {metrics.diasAteProxima === 0
                ? 'hoje'
                : metrics.diasAteProxima === 1
                  ? 'amanhã'
                  : `${metrics.diasAteProxima}d`}
            </div>
          ) : (
            <div className="portal-kpi-value text-muted">—</div>
          )}
          {metrics.proximaEntrega && (
            <div className="portal-kpi-delta truncate">{metrics.proximaEntrega.titulo}</div>
          )}
        </div>
      </div>

      {/* 4. STORYTELLING (desktop only — mobile foca em header + KPIs + alerts + lista) */}
      <div className="hidden md:grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-4">
        {/* Sparkline 6 meses */}
        <div className="card p-4 md:col-span-5 md:p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="font-brand text-sm font-semibold">Ritmo de entregas</div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              últimos 6 meses
            </span>
          </div>
          {metrics.mediaSemestre > 0 ? (
            <div className="mb-3 text-xs text-muted">
              média de {metrics.mediaSemestre.toFixed(1)} entregas/mês
            </div>
          ) : (
            <div className="mb-3 text-xs italic text-muted">
              Ainda construindo histórico de entregas.
            </div>
          )}
          <div className="portal-bars">
            {metrics.mesesCounts.map((count, i) => (
              <div key={i} className="portal-bar-col">
                <div className="portal-bar-value">{count}</div>
                <div className="portal-bar-track">
                  <div
                    className={`portal-bar-fill ${
                      i === metrics.mesesCounts.length - 1 ? 'portal-bar-fill-current' : ''
                    }`}
                    style={{ height: `${(count / metrics.entregasMaxMes) * 100}%` }}
                  />
                </div>
                <div className="portal-bar-label">{metrics.mesesLabels[i]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribuição por projeto */}
        {metrics.distribuicao.length > 0 && (
          <div className="card p-4 md:col-span-4 md:p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="font-brand text-sm font-semibold">Onde a energia está</div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                ativas por projeto
              </span>
            </div>
            <div className="space-y-2.5">
              {metrics.distribuicao.map((d) => (
                <div key={d.projetoId}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink">{d.nome}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{d.count}</span>
                  </div>
                  <div className="portal-dist-track">
                    <div
                      className="portal-dist-fill"
                      style={{ width: `${(d.count / metrics.distribuicaoTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead time + total concluídas */}
        <div className="card flex flex-col p-4 md:col-span-3 md:p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="font-brand text-sm font-semibold">Tempo médio</div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              90d
            </span>
          </div>
          <div className="mb-3 text-xs text-muted">do início ao fim</div>
          {metrics.leadTimeMedio != null ? (
            <div>
              <div className="font-brand text-3xl font-bold text-ink md:text-4xl">
                <span>{metrics.leadTimeMedio}</span>
                <span className="ml-1 text-base font-normal text-muted">dias</span>
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted">
                amostra: {metrics.leadTimeAmostra} tarefa(s)
              </div>
            </div>
          ) : (
            <div className="text-sm italic text-muted">
              Sem entregas suficientes nos últimos 90 dias pra calcular.
            </div>
          )}
          <div className="mt-auto border-t border-line pt-3 text-xs text-muted">
            Total entregue ·{' '}
            <span className="font-mono text-ink-soft">{metrics.totalConcluidas}</span>
          </div>
        </div>
      </div>

      {/* 5. LISTAS */}
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

      <PortalTaskModal
        task={openTask}
        clienteNome={portalCliente?.nome ?? 'cliente'}
        onClose={closeModal}
      />
    </div>
  );
}
