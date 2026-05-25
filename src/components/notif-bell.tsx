'use client';

/**
 * Notificações — Onda 0 · 4.E
 *
 * Sino no header + painel dropdown. Carrega últimas 50 da pessoa logada
 * (recipient_pessoa_id = currentPessoa.id). Filtros chip por tipo
 * (mention / assignment / status). Click numa notif marca como lida e
 * abre a task associada via useTaskModal.
 *
 * Realtime subscribe no canal `notif-<pessoa-id>` (postgres_changes
 * INSERT). Funciona se publication estiver habilitada (decisão de
 * produto adiada). O code está pronto pra ligar.
 *
 * Inserts em mention/assignment/status_change são responsabilidade do
 * task-modal e calendar/kanban quando salvarem mudanças relevantes —
 * adicionado nos respectivos saves.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { fmtPostedEm } from '@/lib/format';

type NotifKind = 'mention' | 'assigned' | 'comment_on_my_task' | 'cliente_respondeu' | 'status_change';
type Notif = {
  id: string;
  recipient_pessoa_id: string;
  kind: NotifKind | string;
  payload: { author?: string; task_id?: string; comment_id?: string; preview?: string; from?: string; to?: string } | null;
  source_task_id: string | null;
  source_comment_id: string | null;
  criado_em: string;
  read_at: string | null;
};
type KindFilter = 'all' | 'mention' | 'assignment' | 'status';

function notifKindGroup(n: Notif): KindFilter | 'other' {
  switch (n.kind) {
    case 'mention':
      return 'mention';
    case 'assigned':
    case 'comment_on_my_task':
    case 'cliente_respondeu':
      return 'assignment';
    case 'status_change':
      return 'status';
    default:
      return 'other';
  }
}

function notifSummary(n: Notif): string {
  const who = n.payload?.author ?? 'alguém';
  switch (n.kind) {
    case 'mention':
      return `${who} te mencionou em uma tarefa`;
    case 'assigned':
      return `${who} te atribuiu a uma tarefa`;
    case 'comment_on_my_task':
      return `${who} comentou em uma tarefa sua`;
    case 'cliente_respondeu':
      return 'Cliente respondeu em uma tarefa sua';
    case 'status_change':
      return `${who} mudou status de uma tarefa sua` + (n.payload?.to ? ` → ${n.payload.to}` : '');
    default:
      return 'nova notificação';
  }
}

function NotifKindIcon({ kind }: { kind: Notif['kind'] }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'mention') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
      </svg>
    );
  }
  if (kind === 'assigned') {
    return (
      <svg {...common}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (kind === 'comment_on_my_task') {
    // message-circle (lucide)
    return (
      <svg {...common}>
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    );
  }
  if (kind === 'cliente_respondeu') {
    // building-2 (lucide) — torre com janelas
    return (
      <svg {...common}>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    );
  }
  if (kind === 'status_change') {
    return (
      <svg {...common}>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    );
  }
  return null;
}

export function NotifBell() {
  const { currentPessoa } = useData();
  const { openEdit } = useTaskModal();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [filter, setFilter] = useState<KindFilter>('all');
  // Seção de lidas inicia colapsada toda vez que abre o painel.
  const [readOpen, setReadOpen] = useState(false);
  useEffect(() => {
    if (open) setReadOpen(false);
  }, [open]);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const pessoaId = currentPessoa?.id;

  // Load + realtime ao montar / quando pessoa resolver
  useEffect(() => {
    if (!pessoaId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await sb
        .from('notifications')
        .select('id, recipient_pessoa_id, kind, payload, source_task_id, source_comment_id, criado_em, read_at')
        .eq('recipient_pessoa_id', pessoaId)
        .order('criado_em', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[notif] load failed', error);
        return;
      }
      setItems((data as Notif[]) ?? []);
    })();

    // Realtime — dormente se publication não tiver `notifications`;
    // quando ligar, dispara toast leve e adiciona no topo.
    const channel = sb
      .channel('notif-' + pessoaId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_pessoa_id=eq.${pessoaId}`,
        },
        (payload) => {
          const n = (payload as unknown as { new?: Notif }).new;
          if (!n) return;
          setItems((cur) => [n, ...cur].slice(0, 50));
          toast.info(notifSummary(n), 6000);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [pessoaId, sb, toast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const unreadCount = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const counts = useMemo(() => {
    const c = { all: 0, mention: 0, assignment: 0, status: 0 };
    for (const n of items) {
      c.all++;
      const g = notifKindGroup(n);
      if (g !== 'other' && g in c) c[g]++;
    }
    return c;
  }, [items]);

  // Splita em duas listas, cada uma ordenada por data desc (mais recente
  // primeiro). A query do load já vem ordenada, mas re-sort defensivo
  // pra inserts realtime + reorder quando marca como lida.
  const { unreadList, readList } = useMemo(() => {
    const base = filter === 'all' ? items : items.filter((n) => notifKindGroup(n) === filter);
    const cmp = (a: Notif, b: Notif) => (b.criado_em || '').localeCompare(a.criado_em || '');
    const unread: Notif[] = [];
    const read: Notif[] = [];
    for (const n of base) {
      if (n.read_at) read.push(n);
      else unread.push(n);
    }
    unread.sort(cmp);
    read.sort(cmp);
    return { unreadList: unread, readList: read };
  }, [items, filter]);

  const markRead = useCallback(
    async (id: string) => {
      const i = items.findIndex((n) => n.id === id);
      if (i < 0) return;
      const prev = items[i];
      if (prev.read_at) return;
      const nowIso = new Date().toISOString();
      setItems((cur) => cur.map((n) => (n.id === id ? { ...n, read_at: nowIso } : n)));
      const { error } = await sb.from('notifications').update({ read_at: nowIso }).eq('id', id);
      if (error) {
        setItems((cur) => cur.map((n) => (n.id === id ? prev : n)));
      }
    },
    [items, sb],
  );

  const markAllRead = useCallback(async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const nowIso = new Date().toISOString();
    setItems((cur) => cur.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })));
    await sb.from('notifications').update({ read_at: nowIso }).in('id', ids);
  }, [items, sb]);

  const openNotif = useCallback(
    async (n: Notif) => {
      await markRead(n.id);
      setOpen(false);
      if (n.source_task_id) openEdit(n.source_task_id);
    },
    [markRead, openEdit],
  );

  if (!pessoaId) {
    // Sem auth ainda — não renderiza
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-icon relative"
        aria-label="Notificações"
        title="Notificações"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full text-[9px] font-bold text-white px-1 flex items-center justify-center"
            style={{ background: 'var(--p0)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed md:absolute top-14 md:top-full right-3 md:right-0 md:mt-2 bg-elev border border-line rounded-lg shadow-xl z-40 w-[340px] max-w-[calc(100vw-24px)] max-h-[70vh] overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-line flex items-center justify-between">
              <div className="font-brand font-semibold text-sm">Notificações</div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-[10px] text-muted hover:text-brand-dark"
                  onClick={markAllRead}
                >
                  marcar tudo lido
                </button>
              )}
            </div>
            {items.length > 0 && (
              <div className="px-2 py-1.5 border-b border-line grid grid-cols-4 gap-1">
                {(['all', 'mention', 'assignment', 'status'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`notif-chip justify-center ${filter === k ? 'is-on' : ''}`}
                    onClick={() => setFilter(k)}
                    title={
                      (k === 'all'
                        ? 'Tudo'
                        : k === 'mention'
                          ? 'Menções'
                          : k === 'assignment'
                            ? 'Atribuições e comentários'
                            : 'Mudanças de status') + ` · ${counts[k]}`
                    }
                  >
                    <FilterChipIcon kind={k} />
                    <span className="opacity-60 ml-1 shrink-0 text-[11px]">{counts[k]}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              {/* Não-lidas — sempre visíveis no topo, ordenadas data desc */}
              {unreadList.map((n) => (
                <NotifRow key={n.id} n={n} onClick={() => openNotif(n)} />
              ))}

              {/* Lidas — agrupadas em accordion (default colapsado, reset
                  toda vez que abre o painel). Permite revisitar sem
                  poluir o feed principal das não-lidas. */}
              {readList.length > 0 && (
                <div className="border-t border-line">
                  <button
                    type="button"
                    onClick={() => setReadOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted hover:bg-bg-elev transition-colors"
                  >
                    <span>
                      Lidas <span className="opacity-60">· {readList.length}</span>
                    </span>
                    <span className="font-mono">{readOpen ? '▾' : '▸'}</span>
                  </button>
                  {readOpen &&
                    readList.map((n) => (
                      <NotifRow key={n.id} n={n} onClick={() => openNotif(n)} />
                    ))}
                </div>
              )}

              {items.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted italic">Sem notificações ainda.</div>
              )}
              {items.length > 0 && unreadList.length + readList.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted italic">Nada nesse filtro.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Ícones SVG pros chips de filtro — mesmo style do sino (lucide-like:
 *  stroke 2, 14×14, currentColor). Sem emoji pra manter consistência. */
function FilterChipIcon({ kind }: { kind: KindFilter }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (kind === 'all') {
    // lista (3 linhas com bullets) — representa "tudo"
    return (
      <svg {...common}>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    );
  }
  if (kind === 'mention') {
    // @ — círculo com curva interna (lucide at-sign)
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
      </svg>
    );
  }
  if (kind === 'assignment') {
    // user (lucide) — cabeça + ombros
    return (
      <svg {...common}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  // status: refresh-cw (lucide) — ciclo
  return (
    <svg {...common}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function NotifRow({ n, onClick }: { n: Notif; onClick: () => void }) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-2.5 border-b border-line last:border-0 hover:bg-brand-tint transition-colors"
      style={
        !n.read_at
          ? { background: 'color-mix(in srgb, var(--brand-tint) 30%, transparent)' }
          : undefined
      }
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        <span className={`notif-kind-icon shrink-0 notif-kind-${n.kind}`} title={String(n.kind)}>
          <NotifKindIcon kind={n.kind} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full"
              style={{ background: n.read_at ? 'transparent' : 'var(--brand)' }}
            />
            <div className={`text-sm truncate ${n.read_at ? 'text-ink-soft' : 'text-ink'}`}>
              {notifSummary(n)}
            </div>
          </div>
          {n.payload?.preview && (
            <div className="text-xs text-muted mt-0.5 truncate pl-3">{n.payload.preview}</div>
          )}
          <div className="text-[10px] font-mono text-muted mt-0.5 pl-3">{fmtPostedEm(n.criado_em)}</div>
        </div>
      </div>
    </button>
  );
}
