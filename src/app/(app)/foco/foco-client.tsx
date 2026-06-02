'use client';

/**
 * Meu Foco — Onda 0 · Bloco 2.6
 *
 * Painel pessoal: o que pede atenção da pessoa selecionada hoje.
 * 4 grupos: atrasadas, hoje, bloqueadas, urgentes (P0/P1 não-listadas
 * nos grupos acima — pra não duplicar). Narrativa heurística no topo
 * sugere a primeira ação.
 *
 * Auth state real (currentPessoa) ainda não está no data-store, então
 * o dropdown "atuando como…" mostra todas as pessoas (admin) e o
 * default é vazio. Persistido em localStorage como o Alpine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData, usePessoasById, useClientesById, useProjetosById } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  agingDays,
  agingLevel,
  atrasada,
  diasAtraso,
  fmtAtrasoLabel,
  fmtDateShort,
  lblStatus,
  needsTriage,
  triageFailures,
} from '@/lib/task-utils';
import { STATUS, SUB_LABELS } from '@/lib/task-constants';
import {
  getBusinessDayCutoff,
  useLastCommentByTask,
  fmtLastComment,
} from '@/lib/use-last-comment';
import type { Task } from '@/lib/types';

const STORAGE_KEY = 'kliente360-focus-pessoa';

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

type FocusGroups = {
  atrasadas: Task[];
  hoje: Task[];
  bloqueadas: Task[];
  urgentes: Task[];
};

type FocoNarrativa = {
  headline: string;
  action: string;
  criticaId: string | null;
};

export function FocoClient() {
  const { tasks, loading, error, currentPessoa, viewerRole } = useData();
  const isAdmin = viewerRole === 'admin';
  const isCliente = viewerRole === 'cliente';
  const { openEdit } = useTaskModal();
  const pessoasById = usePessoasById();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();

  // ===== State =====
  // Foco SEMPRE no usuário logado — admin ou interno, todos veem só
  // a própria visão. Cliente externo cai no banner "Foco indisponível".
  // (Selector de troca de visão removido — v1.03.021.)
  const focusPessoaId = currentPessoa?.id ?? '';

  // Cleanup do localStorage legacy (uso anterior do selector). Roda 1x.
  useEffect(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ok */ }
  }, []);

  // ===== focusGroups =====
  const focusGroups = useMemo<FocusGroups>(() => {
    const empty: FocusGroups = { atrasadas: [], hoje: [], bloqueadas: [], urgentes: [] };
    if (!focusPessoaId) return empty;
    const mine = tasks.filter(
      (t) => t.pessoaId === focusPessoaId && !t.arquivadoEm && t.status !== STATUS.CONCLUIDO,
    );
    const today = new Date().toISOString().slice(0, 10);
    const sortPri = (a: Task, b: Task) => (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9);

    const atrasadas = mine
      .filter((t) => atrasada(t))
      .sort((a, b) => diasAtraso(b) - diasAtraso(a) || sortPri(a, b));
    const hoje = mine.filter((t) => t.prazo === today && !atrasada(t)).sort(sortPri);
    const bloqueadas = mine
      .filter((t) => t.status === 'bloqueado')
      .sort((a, b) => (b.statusEm || 0) - (a.statusEm || 0));
    const seen = new Set([...atrasadas, ...hoje, ...bloqueadas].map((t) => t.id));
    const urgentes = mine
      .filter((t) => (t.prioridade === 'P0' || t.prioridade === 'P1') && !seen.has(t.id))
      .sort(
        (a, b) => sortPri(a, b) || (a.prazo || '9999-12-31').localeCompare(b.prazo || '9999-12-31'),
      );
    return { atrasadas, hoje, bloqueadas, urgentes };
  }, [tasks, focusPessoaId]);

  // ===== Narrativa heurística =====
  const focoNarrativa = useMemo<FocoNarrativa | null>(() => {
    if (!focusPessoaId) return null;
    const g = focusGroups;
    const total = g.atrasadas.length + g.hoje.length + g.bloqueadas.length + g.urgentes.length;
    if (total === 0) {
      const myTasks = tasks.filter(
        (t) =>
          t.pessoaId === focusPessoaId &&
          !t.arquivadoEm &&
          t.status !== STATUS.CONCLUIDO &&
          t.prazo,
      );
      if (myTasks.length === 0) {
        return {
          headline: 'Sem nada agendado.',
          action: 'Aproveite pra atualizar status ou puxar uma task do backlog.',
          criticaId: null,
        };
      }
      const proxima = myTasks.slice().sort((a, b) => a.prazo.localeCompare(b.prazo))[0];
      const dias = Math.max(
        0,
        Math.round((new Date(proxima.prazo + 'T00:00:00').getTime() - Date.now()) / 86400000),
      );
      return {
        headline: 'Sem nada urgente hoje.',
        action: `Próxima entrega: "${proxima.titulo}" em ${dias}d.`,
        criticaId: proxima.id,
      };
    }
    // Sugestão de primeira ação: atrasadas (P0 → P1 → resto) > hoje (P0/P1) > urgentes > bloqueadas
    const sugestao =
      g.atrasadas.find((t) => t.prioridade === 'P0') ||
      g.atrasadas.find((t) => t.prioridade === 'P1') ||
      g.atrasadas[0] ||
      g.hoje.find((t) => t.prioridade === 'P0' || t.prioridade === 'P1') ||
      g.hoje[0] ||
      g.urgentes[0] ||
      g.bloqueadas[0];

    const parts: string[] = [];
    if (g.hoje.length) parts.push(`<strong>${g.hoje.length}</strong> ${g.hoje.length === 1 ? 'entrega pra hoje' : 'entregas pra hoje'}`);
    if (g.atrasadas.length) parts.push(`<strong>${g.atrasadas.length}</strong> ${g.atrasadas.length === 1 ? 'atrasada' : 'atrasadas'}`);
    if (g.bloqueadas.length) parts.push(`<strong>${g.bloqueadas.length}</strong> ${g.bloqueadas.length === 1 ? 'bloqueada' : 'bloqueadas'}`);
    if (g.urgentes.length) parts.push(`<strong>${g.urgentes.length}</strong> ${g.urgentes.length === 1 ? 'P0/P1 ativa' : 'P0/P1 ativas'}`);
    const headline =
      parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' e ' + parts.slice(-1)[0];

    let action = '';
    if (sugestao) {
      let prefixo = '';
      if (g.atrasadas.includes(sugestao)) {
        const tag = sugestao.prioridade === 'P0' || sugestao.prioridade === 'P1' ? ', ' + sugestao.prioridade : '';
        prefixo = `Comece por (mais atrasada${tag}):`;
      } else if (g.hoje.includes(sugestao)) {
        prefixo = `Foco do dia${sugestao.prioridade ? ` (${sugestao.prioridade})` : ''}:`;
      } else if (g.bloqueadas.includes(sugestao)) {
        prefixo = `Destrave:`;
      } else {
        prefixo = `Próxima ação${sugestao.prioridade ? ` (${sugestao.prioridade})` : ''}:`;
      }
      action = `${prefixo} "${sugestao.titulo}"`;
    }
    return { headline, action, criticaId: sugestao ? sugestao.id : null };
  }, [focusPessoaId, focusGroups, tasks]);

  // ===== Hoje (label data da narrativa) =====
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [],
  );

  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  const hasFocus = !!focusPessoaId;
  const counts = focusGroups;

  return (
    <div>
      {/* Desktop · PageHeader fixo no usuário logado (admin não troca de visão) */}
      <div className="hidden md:block">
        <PageHeader
          title={
            hasFocus
              ? <>Foco de {pessoasById.get(focusPessoaId)?.nome ?? '—'}</>
              : 'Foco indisponível'
          }
        />
      </div>

      {/* Setup banner sem pessoa */}
      {!hasFocus && (
        <div className="card p-6 md:p-10 text-center">
          <div className="font-brand text-lg md:text-xl font-semibold mb-2">
            {isAdmin ? 'Quem você quer ver?' : isCliente ? 'Foco indisponível' : 'Sem pessoa vinculada'}
          </div>
          <div className="text-ink-soft text-sm mb-4">
            {isAdmin
              ? 'Selecione a pessoa acima pra ver as tarefas que pedem atenção.'
              : 'Sua sessão não está ligada a uma pessoa cadastrada. Peça pro admin verificar.'}
          </div>
        </div>
      )}

      {/* ============ Painel de foco · MOBILE (handoff §3 · MFoco) ============ */}
      {hasFocus && (
        <FocoMobilePanel
          focusPessoaId={focusPessoaId}
          tasks={tasks}
          openEdit={openEdit}
          clientesById={clientesById}
          projetosById={projetosById}
        />
      )}

      {/* Painel de foco · DESKTOP */}
      {hasFocus && (
        <div className="hidden md:block space-y-4 md:space-y-5">
          {/* Narrativa · min-h padroniza o Y da 2ª linha entre tabs */}
          {focoNarrativa && (
            <div className="card p-4 md:p-5 min-h-[96px]" style={{ borderLeft: '3px solid var(--brand)' }}>
              <div className="text-[10px] uppercase tracking-wider text-muted font-mono mb-1">
                Seu dia · {todayLabel}
              </div>
              <div
                className="text-base md:text-lg leading-snug"
                dangerouslySetInnerHTML={{ __html: focoNarrativa.headline }}
              />
              {focoNarrativa.criticaId ? (
                <button
                  className="mt-2 text-sm text-left text-brand-dark hover:underline cursor-pointer"
                  onClick={() => {
                    if (focoNarrativa.criticaId) openEdit(focoNarrativa.criticaId);
                  }}
                >
                  {focoNarrativa.action}
                </button>
              ) : (
                <div className="mt-2 text-sm text-ink-soft">{focoNarrativa.action}</div>
              )}
            </div>
          )}

          {/* KPIs · min-h padroniza o Y da 2ª linha entre tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-h-[96px]">
            <Kpi label="Atrasadas" value={counts.atrasadas.length} dangerIfPositive />
            <Kpi label="Para hoje" value={counts.hoje.length} />
            <Kpi label="Bloqueadas" value={counts.bloqueadas.length} dangerIfPositive />
            <Kpi label="P0/P1 ativas" value={counts.urgentes.length} />
          </div>

          {/* Lista priorizada — 4 grupos */}
          {([
            { key: 'atrasadas', title: 'Atrasadas', empty: 'Nada atrasado. Bom dia.' },
            { key: 'hoje', title: 'Para hoje', empty: 'Nada com prazo hoje.' },
            { key: 'bloqueadas', title: 'Bloqueadas', empty: 'Sem represas.' },
            { key: 'urgentes', title: 'P0/P1 ativas (sem repetir)', empty: 'Sem urgentes pendentes.' },
          ] as const).map((group) => {
            const items = focusGroups[group.key];
            return (
              <div key={group.key}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="font-brand font-semibold text-sm">{group.title}</div>
                  <span className="text-xs text-muted">{items.length === 1 ? '1 task' : `${items.length} tasks`}</span>
                </div>
                {items.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {items.map((t) => (
                      <FocoCard
                        key={t.id}
                        t={t}
                        onClick={() => openEdit(t.id)}
                        clienteName={clientesById.get(t.clienteId)?.nome ?? '—'}
                        projetoName={projetosById.get(t.projetoId)?.nome ?? '—'}
                        pessoaName={pessoasById.get(t.pessoaId)?.nome ?? '—'}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="card text-center py-4 px-3 text-muted text-xs italic">{group.empty}</div>
                )}
              </div>
            );
          })}

          {/* Sem comentário hoje */}
          <SemComentarioFoco focusPessoaId={focusPessoaId} tasks={tasks} openEdit={openEdit} />

          <div className="text-[10px] text-muted mt-2">
            tarefas concluídas e não atribuídas a você não aparecem. itens podem aparecer em mais de
            um grupo.
          </div>
        </div>
      )}
    </div>
  );
}

// ====================== Sub-componentes ======================

// ── Mobile · MFoco (handoff §3) ─────────────────────────────────────────────
//
// Versão mobile-only do painel de foco. Renderiza title "Foco de hoje"
// com narr de stats, pills Minhas/Atrasadas/Hoje (com contadores) e
// lista de tcard.check (checkbox + título + sub cliente·projeto + Pri
// + chip mono de horas).
//
// O checkbox marca a task como done localmente (visual) — não persiste
// pra evitar conclusão acidental por tap. Pra concluir de verdade, abre
// o modal tocando no corpo do card.

function FocoMobilePanel({
  focusPessoaId,
  tasks,
  openEdit,
  clientesById,
  projetosById,
}: {
  focusPessoaId: string;
  tasks: Task[];
  openEdit: (id: string) => void;
  clientesById: ReturnType<typeof useClientesById>;
  projetosById: ReturnType<typeof useProjetosById>;
}) {
  const [seg, setSeg] = useState<'minhas' | 'atrasadas' | 'hoje'>('minhas');
  const [done, setDone] = useState<Set<string>>(() => new Set());

  const todayIso = new Date().toISOString().slice(0, 10);

  const mine = useMemo(
    () => tasks.filter(
      (t) => t.pessoaId === focusPessoaId && t.status !== STATUS.CONCLUIDO && !t.arquivadoEm,
    ),
    [tasks, focusPessoaId],
  );
  const atrasadasList = useMemo(() => mine.filter((t) => atrasada(t)), [mine]);
  const hojeList = useMemo(
    () => mine.filter((t) => t.prazo === todayIso || atrasada(t)),
    [mine, todayIso],
  );

  const list = seg === 'atrasadas' ? atrasadasList : seg === 'hoje' ? hojeList : mine;
  const totalHoras = list.reduce((a, t) => a + (t.esforco || 0), 0);
  const toggle = (id: string) =>
    setDone((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pills = [
    { v: 'minhas' as const, label: 'Minhas', ct: mine.length },
    { v: 'atrasadas' as const, label: 'Atrasadas', ct: atrasadasList.length },
    { v: 'hoje' as const, label: 'Hoje', ct: hojeList.length },
  ];

  return (
    <div className="md:hidden">
      <div className="m-pagetitle">
        <h1>Foco de <em>hoje</em></h1>
        <div className="narr">
          <b>{list.length}</b> tarefas
          <span className="sep">·</span>
          <b>{totalHoras}h</b> previstas
        </div>
      </div>

      <div className="m-pills">
        {pills.map((p) => (
          <button
            key={p.v}
            type="button"
            className={cn('m-pill', seg === p.v && 'on')}
            onClick={() => setSeg(p.v)}
          >
            {p.label}
            <span className="ct">{p.ct}</span>
          </button>
        ))}
      </div>

      <div className="m-list">
        {list.length === 0 ? (
          <div className="card text-center py-6 px-3 text-muted text-xs italic">
            {seg === 'atrasadas' ? 'Nada atrasado. Bom dia.'
              : seg === 'hoje' ? 'Nada com prazo hoje.'
              : 'Sem tarefas abertas.'}
          </div>
        ) : (
          list.map((t) => {
            const isDone = done.has(t.id);
            const cli = clientesById.get(t.clienteId)?.nome ?? '—';
            const proj = projetosById.get(t.projetoId)?.nome;
            return (
              <div key={t.id} className={cn('tcard check', isDone && 'done')}>
                <button
                  type="button"
                  className="iconbtn"
                  onClick={() => toggle(t.id)}
                  aria-label={isDone ? 'Desmarcar' : 'Marcar como feito'}
                  style={{ width: 28, height: 28, border: '1.5px solid var(--line-strong)', borderRadius: 6 }}
                >
                  {isDone && <Icon name="check" size={14} className="text-[color:var(--green)]" />}
                </button>
                <div className="body" onClick={() => openEdit(t.id)}>
                  <div className="ttl">{t.titulo}</div>
                  <div className="sub">{cli}{proj ? ' · ' + proj : ''}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <MobilePri p={t.prioridade} />
                  {t.esforco > 0 && (
                    <span className="chip font-mono" style={{ padding: '1px 7px', fontSize: 10 }}>
                      {t.esforco}h
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Chip de prioridade mobile (P0/P1/P2/P3) — reusa .pri-P* do DS. */
function MobilePri({ p }: { p: string }) {
  return (
    <span className={cn('pri', `pri-${p}`)}>
      <span className="pri-dot" />
      {p}
    </span>
  );
}

// ── Sem comentário hoje ──────────────────────────────────────────────────────

function SemComentarioFoco({
  focusPessoaId,
  tasks,
  openEdit,
}: {
  focusPessoaId: string;
  tasks: Task[];
  openEdit: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const cutoff = useMemo(() => getBusinessDayCutoff(), []);

  // Só tasks Em andamento da pessoa — fonte pra query de comentários.
  const andamentoIds = useMemo(
    () =>
      tasks
        .filter((t) => t.pessoaId === focusPessoaId && !t.arquivadoEm && t.status === 'andamento')
        .map((t) => t.id),
    [tasks, focusPessoaId],
  );

  const { lastCommentMap, loading } = useLastCommentByTask(andamentoIds);

  const semComentario = useMemo(() => {
    if (!cutoff) return []; // fim de semana → seção oculta
    return tasks
      .filter((t) => {
        if (t.pessoaId !== focusPessoaId) return false;
        if (t.arquivadoEm || t.status !== 'andamento') return false;
        const last = lastCommentMap.get(t.id);
        return !last || last < cutoff;
      })
      .sort((a, b) => {
        const la = lastCommentMap.get(a.id)?.getTime() ?? 0;
        const lb = lastCommentMap.get(b.id)?.getTime() ?? 0;
        return la - lb; // mais antigos primeiro
      });
  }, [tasks, focusPessoaId, lastCommentMap, cutoff]);

  // Fim de semana ou nenhuma task andamento → não renderiza.
  if (!cutoff || andamentoIds.length === 0) return null;

  return (
    <div>
      <button
        className="flex items-center justify-between w-full mb-2 px-1 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 font-brand font-semibold text-sm">
          <span className="text-muted text-xs font-mono">{open ? '▾' : '▸'}</span>
          <span style={{ color: semComentario.length > 0 ? 'var(--p0)' : 'var(--muted)' }}>
            Sem comentário hoje
          </span>
          {loading && (
            <span className="text-[10px] text-muted font-mono font-normal">carregando…</span>
          )}
        </div>
        <span className="text-xs text-muted">
          {semComentario.length === 0
            ? '✓ todas comentadas'
            : `${semComentario.length} task${semComentario.length !== 1 ? 's' : ''}`}
        </span>
      </button>

      {open && (
        semComentario.length === 0 ? (
          <div className="card text-center py-4 px-3 text-[color:var(--brand)] text-xs">
            ✓ Todas as tasks em andamento foram comentadas no último dia útil.
          </div>
        ) : (
          <div className="card divide-y divide-[var(--line)]">
            {semComentario.map((t) => {
              const last = lastCommentMap.get(t.id);
              return (
                <button
                  key={t.id}
                  className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--brand-tint)] transition-colors"
                  onClick={() => openEdit(t.id)}
                >
                  <div className="min-w-0">
                    <div className="text-sm text-ink truncate">{t.titulo}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`pri pri-${t.prioridade}`}>
                      <span className="pri-dot" />
                      {t.prioridade}
                    </span>
                    <span className="text-[10px] font-mono text-[color:var(--p0)]">
                      {fmtLastComment(last)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  dangerIfPositive,
}: {
  label: string;
  value: number;
  dangerIfPositive?: boolean;
}) {
  return (
    <div className="card p-3 md:p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted font-mono">{label}</div>
      <div
        className="font-brand text-2xl md:text-3xl font-semibold mt-1"
        style={dangerIfPositive && value > 0 ? { color: 'var(--p0)' } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function FocoCard({
  t,
  onClick,
  clienteName,
  projetoName,
  pessoaName,
}: {
  t: Task;
  onClick: () => void;
  clienteName: string;
  projetoName: string;
  pessoaName: string;
}) {
  const lvl = agingLevel(t);
  const late = atrasada(t);
  return (
    <div className="kcard" onClick={onClick}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-medium text-sm leading-snug min-w-0">
          {t.privada && (
            <span className="ia-chip ia-chip-mini mr-1" title="Task privada">
              🔒
            </span>
          )}
          {t.criadoPorIa && (
            <span className="ia-chip ia-chip-mini mr-1" title="Criada por automação IA">
              🤖 IA
            </span>
          )}
          {t.titulo}
        </div>
        <span className={`pri shrink-0 pri-${t.prioridade}`}>
          <span className="pri-dot" />
          {t.prioridade}
        </span>
      </div>
      <div className="text-xs text-muted mb-2">{clienteName + ' · ' + projetoName}</div>
      <div className="flex items-center justify-between text-xs gap-2">
        <span className="text-ink-soft truncate">{pessoaName || '—'}</span>
        <span
          className={`shrink-0 ${late ? 'text-[color:var(--p0)] font-medium' : 'text-ink-soft'}`}
        >
          {t.prazo ? (
            <>
              <span className="font-mono">{fmtDateShort(t.prazo)}</span>
              {late && <span className="ml-1">· {fmtAtrasoLabel(diasAtraso(t))}</span>}
            </>
          ) : (
            <span className="italic">sem prazo</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="status text-[10px]" data-s={t.status}>
          <span className="status-dot" />
          {lblStatus(t.status)}
        </span>
        {lblStatus(t.status) !== (SUB_LABELS[t.subetapa] ?? t.subetapa) && (
          <span className="text-[10px] font-mono text-muted">
            › <span className="text-ink-soft">{SUB_LABELS[t.subetapa] ?? t.subetapa}</span>
          </span>
        )}
        {lvl !== 'fresh' && (
          <span className={`aging-badge aging-${lvl}`}>{agingDays(t)}d</span>
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
