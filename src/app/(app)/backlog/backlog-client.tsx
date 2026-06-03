'use client';

/**
 * Backlog — Onda 0 · Bloco 2.2
 * Porta completa da aba Backlog do app Alpine: filtros, busca, sort
 * encadeado, agrupamento, paginação, cards de stats, DnD manual,
 * bulk actions, cards mobile.
 *
 * Pendências de UX (vêm nos próximos blocos):
 *   - Click em linha abrindo modal de task → Bloco 2.3
 *   - Botão excluir linha (admin) → Bloco 2.8 polimento
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { TaskCard } from '@/components/task-card/task-card';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { useData, useClientesById, useProjetosById, usePessoasById, useProjetosByCliente } from '@/lib/data-store';
import { createClient } from '@/lib/supabase/client';
import { useTaskModal } from '@/components/task-modal';
import { useToast } from '@/components/toast';
import { BulkBar, BulkBarClearButton, BulkBarSep } from '@/components/bulk-bar';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { atrasada, agingDays, agingLevel, fmtDate, fmtDateShort, fmtTempoEtapa, isPreTriagem, lblComplex, lblStatus } from '@/lib/task-utils';
import { STATUS, SUB_LABELS, SUBS_FLAT, SUBS_FLAT_ORDER } from '@/lib/task-constants';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';
import type { Filters as StdFilters } from '@/lib/filters';
import type { Cliente, Pessoa, Task } from '@/lib/types';

// Sort manual (DnD) foi removido do Backlog do Alpine — não portamos.
// Sort fica sempre em chain (asc/desc por coluna) ou vazio (criação desc).

// ====================== Tipos locais ======================
type SortKey = {
  key: string;
  dir: 'asc' | 'desc';
};

type Filters = {
  q: string;
  cliente: string;
  projeto: string;
  pessoa: string;
  pri: string;
  complexidade: string;
  status: string;
  tag: string;
  origem: '' | 'ia' | 'humano';
  prazo: '' | 'atrasadas' | 'hoje' | 'semana' | 'sem';
};

type BulkPending = {
  pessoa: string;
  cliente: string;
  projeto: string;
  prioridade: string;
  prazo: string;
  esforco: string;
};

const EMPTY = '__empty__';
const NONE = '__none__';
const LIST_LIMIT_STEP = 100;

const DEFAULT_FILTERS: Filters = {
  q: '',
  cliente: '',
  projeto: '',
  pessoa: '',
  pri: '',
  complexidade: '',
  status: 'abertas',
  tag: '',
  origem: '',
  prazo: '',
};

const DEFAULT_BULK: BulkPending = {
  pessoa: '',
  cliente: '',
  projeto: '',
  prioridade: '',
  prazo: '',
  esforco: '',
};

const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'titulo', label: 'Título' },
  { key: 'clienteId', label: 'Cliente' },
  { key: 'pessoaId', label: 'Responsável' },
  { key: 'prioridade', label: 'Prioridade' },
  { key: 'esforco', label: 'Esforço' },
  { key: 'complexidade', label: 'Complexidade' },
  { key: 'prazo', label: 'Prazo' },
  { key: 'subetapa', label: 'Status' },
];

// ====================== Componente principal ======================
export function BacklogClient() {
  const {
    tasks,
    clientes,
    projetos,
    pessoas,
    loading,
    error,
    patchTasks,
    removeTasks,
    viewerRole,
  } = useData();
  const isAdmin = viewerRole === 'admin';
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const projetosByCliente = useProjetosByCliente();
  const toast = useToast();

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // ============ State local ============
  const [f, setF] = useState<Filters>(() => {
    const s = getSharedFilters();
    return {
      ...DEFAULT_FILTERS,
      cliente: s.cliente,
      projeto: s.projeto,
      pessoa: s.pessoa,
      tag: s.tag,
      prazo: s.prazo,
    };
  });
  useEffect(() => {
    patchSharedFilters({
      cliente: f.cliente,
      projeto: f.projeto,
      pessoa: f.pessoa,
      tag: f.tag,
      prazo: f.prazo,
    });
  }, [f.cliente, f.projeto, f.pessoa, f.tag, f.prazo]);
  const [sortKeys, setSortKeys] = useState<SortKey[]>([]);
  const [groupBy, setGroupBy] = useState<string>('');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [listLimit, setListLimit] = useState(LIST_LIMIT_STEP);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState<BulkPending>(DEFAULT_BULK);

  // Debounce da busca (150ms — igual o Alpine).
  const [qDraft, setQDraft] = useState('');

  // Aplica filtros vindos da URL (Command Palette navega assim).
  // Lê cliente/projeto/pessoa/tag/q dos search params na mount e quando
  // mudam — usuário pode chegar via palette ou link e cair filtrado.
  const searchParams = useSearchParams();
  useEffect(() => {
    const cliente = searchParams.get('cliente') ?? '';
    const projeto = searchParams.get('projeto') ?? '';
    const pessoa = searchParams.get('pessoa') ?? '';
    const tag = searchParams.get('tag') ?? '';
    const q = searchParams.get('q') ?? '';
    if (cliente || projeto || pessoa || tag || q) {
      setF((cur) => ({ ...cur, cliente, projeto, pessoa, tag, q }));
      setQDraft(q);
    }
  }, [searchParams]);
  useEffect(() => {
    const tid = setTimeout(() => setF((cur) => ({ ...cur, q: qDraft })), 150);
    return () => clearTimeout(tid);
  }, [qDraft]);

  // Tags disponíveis (memoizado — só muda quando tasks muda).
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) for (const tag of t.tags) s.add(tag);
    return Array.from(s).sort();
  }, [tasks]);

  const clientesAtivos = useMemo(
    () => clientes.filter((c) => !c.arquivadoEm),
    [clientes],
  );
  const pessoasNaoCliente = useMemo(
    () => pessoas.filter((p) => p.role !== 'cliente'),
    [pessoas],
  );
  const projetosFiltrados = useMemo(() => {
    if (!f.cliente || f.cliente === EMPTY) return projetos.filter((p) => !p.arquivadoEm);
    return (projetosByCliente.get(f.cliente) ?? []).filter((p) => !p.arquivadoEm);
  }, [f.cliente, projetos, projetosByCliente]);

  // ============ Filtros + sort ============
  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    // IA pre-triagem fica fora do backlog SEMPRE (independente de "mostrar
    // arquivadas") — gate A.4. Só aparecem em /triagem.
    const base = showArchived
      ? tasks.filter((t) => !isPreTriagem(t))
      : tasks.filter((t) => !t.arquivadoEm && !isPreTriagem(t));
    const arr = base.filter((t) => {
      if (q) {
        const cli = clientesById.get(t.clienteId)?.nome ?? '';
        const proj = projetosById.get(t.projetoId)?.nome ?? '';
        const pess = pessoasById.get(t.pessoaId)?.nome ?? '';
        const hay = [
          t.titulo, t.descricao ?? '', cli, proj, pess,
          t.prioridade, t.status, t.subetapa,
          (t.tags ?? []).join(' '),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.cliente === EMPTY) {
        if (t.clienteId) return false;
      } else if (f.cliente && t.clienteId !== f.cliente) return false;
      if (f.projeto === EMPTY) {
        if (t.projetoId) return false;
      } else if (f.projeto && t.projetoId !== f.projeto) return false;
      if (f.pessoa === EMPTY) {
        if (t.pessoaId) return false;
      } else if (f.pessoa && t.pessoaId !== f.pessoa) return false;
      if (f.status === 'abertas') {
        if (t.status === STATUS.CONCLUIDO) return false;
      } else if (f.status && t.status !== f.status) return false;
      if (f.pri === EMPTY) {
        if (t.prioridade) return false;
      } else if (f.pri && t.prioridade !== f.pri) return false;
      if (f.complexidade === EMPTY) {
        if (t.complexidade) return false;
      } else if (f.complexidade && (t.complexidade || 'media') !== f.complexidade) return false;
      if (f.tag === EMPTY) {
        if (t.tags.length > 0) return false;
      } else if (f.tag && !t.tags.includes(f.tag)) return false;
      if (f.origem === 'ia' && !t.criadoPorIa) return false;
      if (f.origem === 'humano' && t.criadoPorIa) return false;
      if (f.prazo) {
        const todayIso = new Date().toISOString().slice(0, 10);
        if (f.prazo === 'atrasadas' && !atrasada(t)) return false;
        if (f.prazo === 'hoje' && t.prazo !== todayIso) return false;
        if (f.prazo === 'sem' && t.prazo) return false;
        if (f.prazo === 'semana') {
          if (!t.prazo) return false;
          const in7 = new Date();
          in7.setDate(in7.getDate() + 7);
          const in7Iso = in7.toISOString().slice(0, 10);
          if (t.prazo < todayIso || t.prazo > in7Iso) return false;
        }
      }
      return true;
    });

    // ===== Sort =====
    if (sortKeys.length === 0) {
      arr.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      return arr;
    }
    const resolveVal = (t: Task, k: string): number | string => {
      let v: unknown = (t as unknown as Record<string, unknown>)[k];
      if (k === 'clienteId') v = clientesById.get(t.clienteId)?.nome ?? '';
      if (k === 'projetoId') v = projetosById.get(t.projetoId)?.nome ?? '';
      if (k === 'pessoaId') v = pessoasById.get(t.pessoaId)?.nome ?? '';
      if (k === 'status') {
        v = ({ andamento: 0, bloqueado: 1, backlog: 2, concluido: 3 } as Record<string, number>)[String(v)] ?? 99;
      }
      if (k === 'subetapa') {
        v = SUBS_FLAT_ORDER[String(v)] ?? 99;
      }
      if (k === 'prioridade') v = v ? +String(v).slice(1) : 99;
      if (k === 'complexidade') {
        v = ({ alta: 0, media: 1, baixa: 2 } as Record<string, number>)[String(v)] ?? 1;
      }
      return v == null ? '' : (v as number | string);
    };
    arr.sort((a, b) => {
      for (const { key, dir } of sortKeys) {
        const mul = dir === 'asc' ? 1 : -1;
        const av = resolveVal(a, key);
        const bv = resolveVal(b, key);
        if (av < bv) return -mul;
        if (av > bv) return mul;
      }
      return 0;
    });
    return arr;
  }, [tasks, showArchived, f, sortKeys, clientesById, projetosById, pessoasById]);

  // ============ Agrupamento + paginação ============
  type Group = {
    key: string;
    label: string;
    isAll: boolean;
    tasks: Task[];
    tasksTotal: number;
    hasMore: boolean;
  };

  const grouped = useMemo<Group[]>(() => {
    const trim = (arr: Task[]): { tasks: Task[]; tasksTotal: number; hasMore: boolean } => {
      const total = arr.length;
      if (total <= listLimit) return { tasks: arr, tasksTotal: total, hasMore: false };
      return { tasks: arr.slice(0, listLimit), tasksTotal: total, hasMore: true };
    };
    if (!groupBy) {
      return [{ key: '__all__', label: '', isAll: true, ...trim(filtered) }];
    }
    const map = new Map<string, { key: string; label: string; tasks: Task[] }>();
    for (const t of filtered) {
      let key: string;
      let label: string;
      switch (groupBy) {
        case 'pessoa':
          key = t.pessoaId || NONE;
          label = t.pessoaId ? pessoasById.get(t.pessoaId)?.nome ?? '—' : 'sem responsável';
          break;
        case 'cliente':
          key = t.clienteId || NONE;
          label = t.clienteId ? clientesById.get(t.clienteId)?.nome ?? '—' : '— sem cliente';
          break;
        case 'projeto':
          key = t.projetoId || NONE;
          label = t.projetoId ? projetosById.get(t.projetoId)?.nome ?? '—' : '— sem projeto';
          break;
        case 'status':
          key = t.status;
          label = lblStatus(t.status);
          break;
        case 'subetapa':
          key = t.subetapa;
          label = SUB_LABELS[t.subetapa] ?? t.subetapa;
          break;
        case 'prioridade':
          key = t.prioridade;
          label = t.prioridade;
          break;
        case 'complexidade':
          key = t.complexidade || 'media';
          label = lblComplex(t.complexidade);
          break;
        default:
          key = '__all__';
          label = '';
      }
      let g = map.get(key);
      if (!g) {
        g = { key, label, tasks: [] };
        map.set(key, g);
      }
      g.tasks.push(t);
    }
    const groups = Array.from(map.values()).map((g) => ({ ...g, isAll: false, ...trim(g.tasks) }));
    if (groupBy === 'prioridade') {
      const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
      groups.sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
    } else if (groupBy === 'status') {
      const order: Record<string, number> = { andamento: 0, bloqueado: 1, backlog: 2, concluido: 3 };
      groups.sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
    } else if (groupBy === 'subetapa') {
      groups.sort((a, b) => (SUBS_FLAT_ORDER[a.key] ?? 99) - (SUBS_FLAT_ORDER[b.key] ?? 99));
    } else if (groupBy === 'complexidade') {
      const order: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
      groups.sort((a, b) => (order[a.key] ?? 9) - (order[b.key] ?? 9));
    } else {
      groups.sort((a, b) => {
        if (a.key === NONE) return 1;
        if (b.key === NONE) return -1;
        return a.label.localeCompare(b.label);
      });
    }
    return groups;
  }, [filtered, groupBy, listLimit, pessoasById, clientesById, projetosById]);

  // ============ Stats ============
  const backlogTotalAbertas = useMemo(
    () => tasks.filter((t) => !t.arquivadoEm && t.status !== STATUS.CONCLUIDO).length,
    [tasks],
  );
  const cards = useMemo(() => {
    return {
      total: filtered.length,
      backlog: filtered.filter((t) => t.status === 'backlog').length,
      andamento: filtered.filter((t) => t.status === 'andamento').length,
      bloqueadas: filtered.filter((t) => t.status === 'bloqueado').length,
      atrasadas: filtered.filter((t) => atrasada(t)).length,
    };
  }, [filtered]);

  // Conta tudo que difere do estado neutro — incluindo os toggles do
  // menu ⋯ (mostrar arquivadas + agrupar) e os filtros do page-bar.
  // q e tag entram no badge final separadamente porque vivem fora do
  // objeto `f` no markup; mas conceitualmente também contam.
  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (f.cliente) n++;
    if (f.projeto) n++;
    if (f.pessoa) n++;
    if (f.pri) n++;
    if (f.complexidade) n++;
    if (f.status && f.status !== 'abertas') n++;
    if (f.origem) n++;
    if (f.prazo) n++;
    if (showArchived) n++;
    if (groupBy) n++;
    return n;
  }, [f, showArchived, groupBy]);

  const clearFilters = useCallback(() => {
    setF(DEFAULT_FILTERS);
    setQDraft('');
    setShowArchived(false);
    setGroupBy('');
    setCollapsedGroups([]);
    clearSharedFilters();
  }, []);

  // g+l global → limpa filtros desta tela.
  useEffect(() => {
    const handler = () => clearFilters();
    window.addEventListener(CLEAR_FILTERS_EVENT, handler);
    return () => window.removeEventListener(CLEAR_FILTERS_EVENT, handler);
  }, [clearFilters]);

  // ============ Sort handlers ============
  const sortBy = useCallback((key: string) => {
    setSortKeys((cur) => {
      const idx = cur.findIndex((s) => s.key === key);
      if (idx === -1) {
        const rest = cur.filter((s) => s.key !== key).slice(0, 2);
        return [{ key, dir: 'asc' }, ...rest];
      }
      if (idx > 0) {
        const rest = cur.filter((s) => s.key !== key).slice(0, 2);
        return [{ key, dir: 'asc' }, ...rest];
      }
      if (cur[0].dir === 'asc') {
        return [{ key, dir: 'desc' }, ...cur.slice(1)];
      }
      return cur.slice(1);
    });
  }, []);

  const sortIcon = useCallback(
    (key: string): string => {
      const idx = sortKeys.findIndex((s) => s.key === key);
      if (idx === -1) return '';
      const { dir } = sortKeys[idx];
      const arrow = dir === 'asc' ? '▲' : '▼';
      return sortKeys.length > 1 ? `${arrow}${idx + 1}` : arrow;
    },
    [sortKeys],
  );

  // ============ Group handlers ============
  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }, []);
  const loadMore = useCallback(() => setListLimit((n) => n + LIST_LIMIT_STEP), []);

  // ============ Bulk actions ============
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }, []);
  const toggleSelectAll = useCallback(() => {
    const visible = filtered.map((t) => t.id);
    setSelectedIds((cur) => {
      const allSel = visible.length > 0 && visible.every((id) => cur.includes(id));
      if (allSel) return cur.filter((id) => !visible.includes(id));
      return Array.from(new Set([...cur, ...visible]));
    });
  }, [filtered]);
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
    if (p.cliente) {
      updates.cliente_id = p.cliente === NONE ? null : p.cliente;
      updates.projeto_id = null;
      localPatch.clienteId = p.cliente === NONE ? '' : p.cliente;
      localPatch.projetoId = '';
    }
    if (p.projeto) {
      updates.projeto_id = p.projeto === NONE ? null : p.projeto;
      localPatch.projetoId = p.projeto === NONE ? '' : p.projeto;
    }
    if (p.prioridade) {
      updates.prioridade = p.prioridade;
      localPatch.prioridade = p.prioridade as Task['prioridade'];
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
    if (Object.keys(updates).length === 0) return;
    const { error } = await sb.from('tasks').update(updates).in('id', ids);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    patchTasks(ids, localPatch);
    setBulkPending(DEFAULT_BULK);
  }, [bulkPending, selectedIds, sb, patchTasks, toast]);

  const bulkArquivar = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const nowIso = new Date().toISOString();
    const { error } = await sb.from('tasks').update({ arquivado_em: nowIso }).in('id', ids);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    patchTasks(ids, { arquivadoEm: nowIso });
    setSelectedIds([]);
  }, [selectedIds, sb, patchTasks, toast]);

  const bulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} tarefa(s)? Esta ação não pode ser desfeita.`)) return;
    try {
      const { data: atts } = await sb.from('task_attachments').select('storage_path').in('task_id', ids);
      const paths = ((atts ?? []) as { storage_path: string | null }[]).map((a) => a.storage_path).filter((p): p is string => !!p);
      if (paths.length) await sb.storage.from('task-attachments').remove(paths);
    } catch {
      /* best-effort */
    }
    const { error } = await sb.from('tasks').delete().in('id', ids);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    removeTasks(ids);
    setSelectedIds([]);
  }, [selectedIds, sb, removeTasks, toast]);

  const { openEdit: openEditModal, openNew } = useTaskModal();
  const openEdit = useCallback((t: Task) => openEditModal(t.id), [openEditModal]);

  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  return (
    // flex+gap em vez de space-y-4: o space-y do Tailwind usa
    // :not([hidden]) que só pega o atributo HTML — a classe `hidden`
    // do page-bar desktop não conta, então o gap caía no primeiro
    // filho visível do mobile. Com flex+gap, elementos display:none
    // são totalmente ignorados.
    <div>
      {/* ============ Desktop · PageHeader + FilterBar (DS) — bare div: pageheader.mb:24 controla Y do primeiro elemento ============ */}
      <div className="hidden md:block">
        <PageHeader
          title="Backlog"
          right={
            <FilterBar
              f={{
                q: qDraft,
                cliente: f.cliente,
                projeto: f.projeto,
                resp: f.pessoa,
                prazo: f.prazo,
              } satisfies StdFilters}
              set={(key, value) => {
                if (key === 'q') setQDraft(value);
                else if (key === 'cliente') setF({ ...f, cliente: value, projeto: value ? f.projeto : '' });
                else if (key === 'projeto') setF({ ...f, projeto: value });
                else if (key === 'resp') setF({ ...f, pessoa: value });
                else if (key === 'prazo') setF({ ...f, prazo: value as Filters['prazo'] });
              }}
              onClear={() => {
                setQDraft('');
                clearFilters();
              }}
              clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
              projetoOptions={projetosFiltrados.map((p) => ({ v: p.id, label: p.nome }))}
              pessoaOptions={pessoasNaoCliente.map((p) => ({ v: p.id, label: p.nome }))}
              moreItems={[
                {
                  key: 'group-pessoa',
                  label: groupBy === 'pessoa' ? 'Agrupando: Responsável ✓' : 'Agrupar: Responsável',
                  kind: 'action',
                  icon: 'users',
                  onClick: () => {
                    setGroupBy(groupBy === 'pessoa' ? '' : 'pessoa');
                    setCollapsedGroups([]);
                  },
                },
                {
                  key: 'group-cliente',
                  label: groupBy === 'cliente' ? 'Agrupando: Cliente ✓' : 'Agrupar: Cliente',
                  kind: 'action',
                  icon: 'building',
                  onClick: () => {
                    setGroupBy(groupBy === 'cliente' ? '' : 'cliente');
                    setCollapsedGroups([]);
                  },
                },
                {
                  key: 'group-status',
                  label: groupBy === 'status' ? 'Agrupando: Status ✓' : 'Agrupar: Status',
                  kind: 'action',
                  icon: 'list-filter',
                  onClick: () => {
                    setGroupBy(groupBy === 'status' ? '' : 'status');
                    setCollapsedGroups([]);
                  },
                },
                { key: 'div1', label: '---' },
                {
                  key: 'arquivadas',
                  label: 'Mostrar arquivadas',
                  kind: 'toggle',
                  active: showArchived,
                  onClick: () => setShowArchived((v) => !v),
                },
                {
                  key: 'ia',
                  label: 'Somente criadas por IA',
                  kind: 'toggle',
                  active: f.origem === 'ia',
                  onClick: () => setF({ ...f, origem: f.origem === 'ia' ? '' : 'ia' }),
                },
                {
                  key: 'humano',
                  label: 'Somente criadas por humanos',
                  kind: 'toggle',
                  active: f.origem === 'humano',
                  onClick: () => setF({ ...f, origem: f.origem === 'humano' ? '' : 'humano' }),
                },
              ] satisfies MoreMenuItem[]}
            />
          }
        />
      </div>

      {/* ============ MOBILE · MBacklog (handoff §3.1) ============ */}
      <BacklogMobilePanel
        tasks={filtered}
        clientesById={clientesById}
        projetosById={projetosById}
        pessoasById={pessoasById}
        qDraft={qDraft}
        setQDraft={setQDraft}
        f={f}
        setF={setF}
        clientesAtivos={clientesAtivos}
        pessoasNaoCliente={pessoasNaoCliente}
        onOpen={openEdit}
        clearFilters={clearFilters}
      />

      {/* ============ Mobile filters (LEGADO — escondido pela nova
           BacklogMobilePanel; manter source pra restore se necessário) ============ */}
      <div className="hidden md:hidden grid grid-cols-2 gap-2 mb-4" style={{ display: 'none' }}>
        <div className="col-span-1">
          <input
            type="text"
            className="inp"
            placeholder="Buscar título…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
          />
        </div>
        <div className="col-span-1">
          <button className="btn w-full justify-center" onClick={() => setFiltersOpen((v) => !v)} type="button">
            <span>Filtros</span>
            {activeFiltersCount > 0 && <span className="badge-count">{activeFiltersCount}</span>}
            <span className="ml-1 text-muted">{filtersOpen ? '▴' : '▾'}</span>
          </button>
        </div>
        {filtersOpen && (
          <>
            <div className="col-span-2">
              <select
                className={`inp ${f.cliente ? 'is-active' : ''}`}
                value={f.cliente}
                onChange={(e) => setF({ ...f, cliente: e.target.value, projeto: e.target.value ? f.projeto : '' })}
              >
                <option value="">Cliente</option>
                <option value={EMPTY}>— sem cliente</option>
                {clientesAtivos.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <select
                className={`inp ${f.projeto ? 'is-active' : ''}`}
                value={f.projeto}
                disabled={!f.cliente}
                onChange={(e) => setF({ ...f, projeto: e.target.value })}
              >
                <option value="">Projeto</option>
                <option value={EMPTY}>— sem projeto</option>
                {projetosFiltrados.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <select
                className={`inp ${f.pessoa ? 'is-active' : ''}`}
                value={f.pessoa}
                onChange={(e) => setF({ ...f, pessoa: e.target.value })}
              >
                <option value="">Responsável</option>
                <option value={EMPTY}>— sem responsável</option>
                {pessoasNaoCliente.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-1">
              <select className={`inp ${f.pri ? 'is-active' : ''}`} value={f.pri} onChange={(e) => setF({ ...f, pri: e.target.value })}>
                <option value="">Pri</option>
                <option value={EMPTY}>— vazio</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
            </div>
            <div className="col-span-1">
              <select
                className={`inp ${f.complexidade ? 'is-active' : ''}`}
                value={f.complexidade}
                onChange={(e) => setF({ ...f, complexidade: e.target.value })}
              >
                <option value="">Cmplx</option>
                <option value={EMPTY}>— vazio</option>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
            <div className="col-span-2">
              <select
                className={`inp ${f.status && f.status !== 'abertas' ? 'is-active' : ''}`}
                value={f.status}
                onChange={(e) => setF({ ...f, status: e.target.value })}
              >
                <option value="abertas">Abertas (sem concluídas)</option>
                <option value="">Todas</option>
                <option value="backlog">Backlog</option>
                <option value="andamento">Em andamento</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="concluido">Concluído</option>
              </select>
            </div>
            {allTags.length > 0 && (
              <div className="col-span-2">
                <select className={`inp ${f.tag ? 'is-active' : ''}`} value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>
                  <option value="">Tag</option>
                  <option value={EMPTY}>— sem tags</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>#{t}</option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ Mobile: agrupar + ordenar (LEGADO escondido) ============ */}
      <div className="hidden md:hidden grid grid-cols-2 gap-2 mb-3" style={{ display: 'none' }}>
        <select
          className="inp text-xs py-1.5"
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value);
            setCollapsedGroups([]);
          }}
          title="Agrupar tarefas por…"
        >
          <option value="">Agrupar: nenhum</option>
          <option value="pessoa">Agrupar: Responsável</option>
          <option value="cliente">Agrupar: Cliente</option>
          <option value="projeto">Agrupar: Projeto</option>
          <option value="status">Agrupar: Status</option>
          <option value="subetapa">Agrupar: Etapa</option>
          <option value="prioridade">Agrupar: Prioridade</option>
          <option value="complexidade">Agrupar: Complexidade</option>
        </select>
        <div className="relative">
          <button
            className="inp text-xs py-1.5 w-full text-left flex items-center justify-between gap-1"
            onClick={() => setSortPanelOpen((v) => !v)}
            type="button"
          >
            <span className="truncate">
              {sortKeys.length
                ? 'Ordenar: ' + (SORT_OPTIONS.find((o) => o.key === sortKeys[0].key)?.label ?? sortKeys[0].key)
                : 'Sem ordenação'}
            </span>
            {sortKeys.length > 0 && (
              <span className="text-muted shrink-0">{sortKeys[0].dir === 'asc' ? '↑' : '↓'}</span>
            )}
          </button>
          {sortPanelOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setSortPanelOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-elev border border-line rounded-md shadow-xl z-40 w-[220px] py-1 max-h-[60vh] overflow-y-auto">
                {SORT_OPTIONS.map((opt) => {
                  const active = sortKeys.some((s) => s.key === opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-brand-tint transition-colors ${active ? '!bg-brand-tint !text-brand-dark font-medium' : ''}`}
                      onClick={() => {
                        sortBy(opt.key);
                        setSortPanelOpen(false);
                      }}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <span className="font-mono text-muted text-[11px]">{sortIcon(opt.key)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {(activeFiltersCount > 0 || f.q || f.tag) && (
          <button className="btn btn-ghost text-xs col-span-2" onClick={clearFilters}>
            ✕ limpar filtros
            <span className="badge-count ml-1">{activeFiltersCount + (f.q ? 1 : 0) + (f.tag ? 1 : 0)}</span>
          </button>
        )}
      </div>

      {/* ============ Cards de stats · min-h padroniza Y da 2ª linha entre tabs ============ */}
      <div className="hidden md:grid grid-cols-5 gap-3 mb-4 min-h-[116px]">
        <StatCard label="Total filtrado" value={cards.total} />
        <StatCard label="Backlog" value={cards.backlog} borderColor="var(--line-strong)" />
        <StatCard label="Em andamento" value={cards.andamento} borderColor="var(--brand)" />
        <StatCard
          label="Bloqueadas"
          value={cards.bloqueadas}
          borderColor="var(--p0)"
          valueColor={cards.bloqueadas > 0 ? 'var(--p0)' : undefined}
        />
        <StatCard
          label="Atrasadas"
          value={cards.atrasadas}
          borderColor="var(--p1)"
          valueColor={cards.atrasadas > 0 ? 'var(--p1)' : undefined}
        />
      </div>

      {/* ============ Desktop table ============ */}
      <div className="card tbl-wrap hidden md:block">
        <table className="tbl">
          <colgroup>
            <col style={{ width: 52 }} />
            <col />
            <col style={{ width: 200 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="w-8" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={filtered.length > 0 && filtered.every((t) => selectedIds.includes(t.id))}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.length > 0 && !filtered.every((t) => selectedIds.includes(t.id));
                  }}
                  onChange={toggleSelectAll}
                  title="Selecionar todas as visíveis"
                />
              </th>
              <SortableTh label="Tarefa" sortKey="titulo" sortBy={sortBy} sortIcon={sortIcon} />
              <SortableTh label="Cliente · Projeto" sortKey="clienteId" sortBy={sortBy} sortIcon={sortIcon} />
              <SortableTh label="Responsável" sortKey="pessoaId" sortBy={sortBy} sortIcon={sortIcon} />
              <SortableTh label="Pri" sortKey="prioridade" sortBy={sortBy} sortIcon={sortIcon} title="Prioridade" />
              <SortableTh label="h" sortKey="esforco" sortBy={sortBy} sortIcon={sortIcon} title="Horas previstas" align="right" />
              <SortableTh label="Cmplx" sortKey="complexidade" sortBy={sortBy} sortIcon={sortIcon} title="Complexidade" />
              <SortableTh label="Prazo" sortKey="prazo" sortBy={sortBy} sortIcon={sortIcon} />
              <SortableTh label="Status" sortKey="subetapa" sortBy={sortBy} sortIcon={sortIcon} />
              <th className="w-8"></th>
            </tr>
          </thead>
          {grouped.map((g) => (
            <tbody key={g.key}>
              {!g.isAll && (
                <tr className="group-header cursor-pointer" onClick={() => toggleGroup(g.key)}>
                  <td colSpan={10} className="bg-bg-elev hover:bg-brand-tint transition-colors py-2 px-3 border-y border-line">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted font-mono text-xs w-3 inline-block">
                          {collapsedGroups.includes(g.key) ? '▸' : '▾'}
                        </span>
                        <span className="font-semibold text-sm text-ink truncate">{g.label}</span>
                      </div>
                      <span className="text-xs font-mono text-muted shrink-0">
                        {g.tasks.length} · {g.tasks.reduce((a, b) => a + (+b.esforco || 0), 0)}h
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {(g.isAll || !collapsedGroups.includes(g.key)) && g.tasks.map((t) => {
                const sel = selectedIds.includes(t.id);
                const lvl = agingLevel(t);
                return (
                  <tr
                    key={t.id}
                    onClick={() => openEdit(t)}
                    className={[
                      sel ? 'bg-brand-tint' : '',
                      t.arquivadoEm ? 'opacity-50' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="cursor-pointer"
                        checked={sel}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </td>
                    <td>
                      <div className="tbl-title" title={t.titulo}>
                        {t.privada && <span className="ia-chip ia-chip-mini mr-1" title="Task privada">🔒</span>}
                        {t.criadoPorIa && <span className="ia-chip ia-chip-mini mr-1" title="Criada por automação IA">🤖 IA</span>}
                        {t.titulo}
                      </div>
                      {t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {t.tags.map((tag) => (
                            <span
                              key={tag}
                              className="tag-chip tag-chip-link"
                              onClick={(e) => {
                                e.stopPropagation();
                                setF({ ...f, tag });
                              }}
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="tbl-cliproj" title={`${clientesById.get(t.clienteId)?.nome ?? '—'} · ${projetosById.get(t.projetoId)?.nome ?? '—'}`}>
                        {(clientesById.get(t.clienteId)?.nome ?? '—') + ' · ' + (projetosById.get(t.projetoId)?.nome ?? '—')}
                      </span>
                    </td>
                    <td className="text-ink-soft truncate" title={pessoasById.get(t.pessoaId)?.nome ?? '—'}>
                      {pessoasById.get(t.pessoaId)?.nome ?? '—'}
                    </td>
                    <td>
                      <span className={`pri pri-${t.prioridade}`}>
                        <span className="pri-dot" />
                        {t.prioridade}
                      </span>
                    </td>
                    <td className="font-mono text-ink-soft text-right">{t.esforco}h</td>
                    <td>
                      <span className={`cx cx-${t.complexidade || 'media'}`}>
                        <span className="cx-bar">
                          <i className={t.complexidade === 'baixa' || t.complexidade === 'media' || t.complexidade === 'alta' ? 'on' : ''} style={{ height: 6 }} />
                          <i className={t.complexidade === 'media' || t.complexidade === 'alta' ? 'on' : ''} style={{ height: 9 }} />
                          <i className={t.complexidade === 'alta' ? 'on' : ''} style={{ height: 12 }} />
                        </span>
                        {lblComplex(t.complexidade)}
                      </span>
                    </td>
                    <td>
                      <span className={atrasada(t) ? 'late' : ''}>{t.prazo ? fmtDate(t.prazo) : '—'}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                        <span
                          className="status"
                          data-s={t.status}
                          title={`${lblStatus(t.status)} · ${fmtTempoEtapa(t.statusEm)}`}
                        >
                          <span className="status-dot" />
                          {SUB_LABELS[t.subetapa] ?? t.subetapa}
                        </span>
                        {lvl !== 'fresh' && (
                          <span
                            className={`aging-badge aging-${lvl}`}
                            title={`parada há ${agingDays(t)} dias neste status`}
                          >
                            {agingDays(t)}d
                          </span>
                        )}
                      </div>
                    </td>
                    <td></td>
                  </tr>
                );
              })}
              {g.hasMore && (g.isAll || !collapsedGroups.includes(g.key)) && (
                <tr>
                  <td colSpan={10} className="py-3 px-4 bg-bg">
                    <button className="btn btn-ghost text-xs w-full justify-center" onClick={loadMore}>
                      mostrando {g.tasks.length} de {g.tasksTotal} · carregar mais{' '}
                      {Math.min(LIST_LIMIT_STEP, g.tasksTotal - g.tasks.length)}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          ))}
          {filtered.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={10} className="text-center py-12 md:py-16">
                  <div className="font-brand text-xl mb-2 text-ink">Nada por aqui.</div>
                  <div className="text-sm text-muted mb-4">
                    {tasks.length > 0 ? 'Tente ajustar os filtros…' : 'Comece criando a primeira tarefa.'}
                  </div>
                  <button className="btn btn-primary" onClick={openNew}>
                    + Nova tarefa
                  </button>
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      {/* ============ Mobile cards (LEGADO escondido) ============ */}
      <div className="hidden md:hidden space-y-3" style={{ display: 'none' }}>
        {grouped.map((g) => (
          <div key={g.key}>
            {!g.isAll && (
              <div className="flex items-center justify-between gap-2 px-1 py-2 mb-1 cursor-pointer" onClick={() => toggleGroup(g.key)}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted font-mono text-xs w-3 inline-block">
                    {collapsedGroups.includes(g.key) ? '▸' : '▾'}
                  </span>
                  <span className="font-semibold text-sm text-ink truncate">{g.label}</span>
                </div>
                <span className="text-xs font-mono text-muted shrink-0">
                  {g.tasks.length} · {g.tasks.reduce((a, b) => a + (+b.esforco || 0), 0)}h
                </span>
              </div>
            )}
            {(g.isAll || !collapsedGroups.includes(g.key)) && (
              <div className="space-y-2">
                {g.tasks.map((t) => {
                  const lvl = agingLevel(t);
                  return (
                    <div key={t.id} className="kcard" onClick={() => openEdit(t)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-medium text-sm leading-snug min-w-0">
                          {t.privada && <span className="ia-chip ia-chip-mini mr-1" title="Task privada">🔒</span>}
                          {t.criadoPorIa && <span className="ia-chip ia-chip-mini mr-1" title="Criada por automação IA">🤖 IA</span>}
                          {t.titulo}
                        </div>
                        <span className={`pri shrink-0 pri-${t.prioridade}`}>
                          <span className="pri-dot" />
                          {t.prioridade}
                        </span>
                      </div>
                      <div className="text-xs text-muted mb-2">
                        {(clientesById.get(t.clienteId)?.nome ?? '—') + ' · ' + (projetosById.get(t.projetoId)?.nome ?? '—')}
                      </div>
                      {t.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {t.tags.map((tag) => (
                            <span key={tag} className="tag-chip">#{tag}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-ink-soft truncate">{pessoasById.get(t.pessoaId)?.nome ?? '—'}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`cx cx-${t.complexidade || 'media'}`}>{lblComplex(t.complexidade)}</span>
                          <span className="font-mono text-muted">{t.esforco || 0}h</span>
                          <span className={`font-mono ${atrasada(t) ? 'late' : ''}`}>
                            {t.prazo ? fmtDateShort(t.prazo) : '—'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="status text-[10px]" data-s={t.status}>
                          <span className="status-dot" />
                          {lblStatus(t.status)}
                        </span>
                        {lblStatus(t.status) !== (SUB_LABELS[t.subetapa] ?? t.subetapa) && (
                          <span className="text-[10px] text-muted">
                            › <span className="text-ink-soft">{SUB_LABELS[t.subetapa] ?? t.subetapa}</span>
                          </span>
                        )}
                        {lvl !== 'fresh' && (
                          <span className={`aging-badge aging-${lvl}`}>{agingDays(t)}d</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {g.hasMore && (
                  <button className="btn btn-ghost text-xs w-full justify-center py-2" onClick={loadMore}>
                    mostrando {g.tasks.length} de {g.tasksTotal} · carregar mais{' '}
                    {Math.min(LIST_LIMIT_STEP, g.tasksTotal - g.tasks.length)}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card text-center py-10 px-4">
            <div className="font-brand text-base mb-2 text-ink">Nada por aqui.</div>
            <div className="text-xs text-muted mb-3">
              {tasks.length > 0 ? 'Tente ajustar os filtros…' : 'Comece criando a primeira tarefa.'}
            </div>
          </div>
        )}
      </div>

      <BulkBar selectedCount={selectedIds.length} onClear={clearSelection}>
        <select
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[130px]"
          value={bulkPending.pessoa}
          onChange={(e) => setBulkPending({ ...bulkPending, pessoa: e.target.value })}
          title="Responsável"
        >
          <option value="">responsável…</option>
          <option value={NONE}>— remover</option>
          {pessoasNaoCliente.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        <select
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[120px]"
          value={bulkPending.cliente}
          onChange={(e) => setBulkPending({ ...bulkPending, cliente: e.target.value, projeto: '' })}
          title="Cliente"
        >
          <option value="">cliente…</option>
          <option value={NONE}>— remover</option>
          {clientesAtivos.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        <select
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[120px]"
          value={bulkPending.projeto}
          disabled={!bulkPending.cliente || bulkPending.cliente === NONE}
          onChange={(e) => setBulkPending({ ...bulkPending, projeto: e.target.value })}
          title="Projeto"
        >
          <option value="">projeto…</option>
          <option value={NONE}>— remover</option>
          {(bulkPending.cliente && bulkPending.cliente !== NONE
            ? (projetosByCliente.get(bulkPending.cliente) ?? []).filter((p) => !p.arquivadoEm)
            : []
          ).map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
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
          step={0.5}
          className="inp text-sm md:text-xs py-2 md:py-1.5 w-full md:w-[90px]"
          placeholder="esforço (h)"
          value={bulkPending.esforco}
          onChange={(e) => setBulkPending({ ...bulkPending, esforco: e.target.value })}
          title="Esforço (h)"
        />
        <div className="flex gap-2 md:contents">
          <button
            type="button"
            className="btn btn-primary text-sm md:text-xs py-2 md:py-1.5 px-3 md:px-2 flex-1 md:flex-none justify-center"
            onClick={bulkSave}
            disabled={
              !(
                bulkPending.pessoa ||
                bulkPending.cliente ||
                bulkPending.projeto ||
                bulkPending.prioridade ||
                bulkPending.prazo ||
                bulkPending.esforco !== ''
              )
            }
          >
            salvar
          </button>
          <button
            type="button"
            className="btn text-sm md:text-xs py-2 md:py-1.5 px-3 md:px-2 flex-1 md:flex-none justify-center"
            onClick={bulkArquivar}
            title="Arquivar selecionadas"
          >
            arquivar
          </button>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-danger text-sm md:text-xs py-2 md:py-1.5 px-3 md:px-2 flex-1 md:flex-none justify-center"
              onClick={bulkDelete}
              title="Excluir selecionadas"
            >
              excluir
            </button>
          )}
          <BulkBarSep />
          <BulkBarClearButton onClick={clearSelection} />
        </div>
      </BulkBar>
    </div>
  );
}

// ====================== Sub-componentes ======================

function StatCard({
  label,
  value,
  borderColor,
  valueColor,
}: {
  label: string;
  value: number;
  borderColor?: string;
  valueColor?: string;
}) {
  return (
    <div className="card p-3 md:p-4 flex flex-col justify-center" style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-muted font-mono">{label}</div>
      <div
        className="font-brand text-2xl md:text-3xl font-semibold mt-1"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sortBy,
  sortIcon,
  title,
  align,
}: {
  label: string;
  sortKey: string;
  sortBy: (k: string) => void;
  sortIcon: (k: string) => string;
  title?: string;
  align?: 'right';
}) {
  return (
    <th
      className={`sortable ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => sortBy(sortKey)}
      title={title}
    >
      {label} <span className="text-[10px] ml-1 text-ink">{sortIcon(sortKey)}</span>
    </th>
  );
}

// ============================================================
// MOBILE · MBacklog (handoff §3.1)
// ============================================================
// Painel mobile do Backlog: m-pagetitle + m-filterbar (search + filter
// button com badge) + chips de filtros ativos removíveis + m-list de
// tcard. O filter button abre um bottom sheet com 4 rows (cliente /
// responsável / prioridade / prazo).
//
// Reusa o estado de filtros do componente pai (props f/setF, qDraft/
// setQDraft) pra que mudanças mobile sincronizem com desktop ao trocar
// de viewport.
function BacklogMobilePanel({
  tasks,
  clientesById,
  projetosById,
  pessoasById,
  qDraft,
  setQDraft,
  f,
  setF,
  clientesAtivos,
  pessoasNaoCliente,
  onOpen,
  clearFilters,
}: {
  tasks: Task[];
  clientesById: Map<string, { nome: string }>;
  projetosById: Map<string, { nome: string }>;
  pessoasById: Map<string, { nome: string }>;
  qDraft: string;
  setQDraft: (v: string) => void;
  f: Filters;
  setF: (next: Filters) => void;
  clientesAtivos: Cliente[];
  pessoasNaoCliente: Pessoa[];
  onOpen: (t: Task) => void;
  clearFilters: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // Compat: f.pessoa/f.pri/f.prazo (existem em Filters). Count ativos
  // que serão mostrados como chip removível.
  const activeChips: Array<{ key: keyof Filters; label: string }> = [];
  if (f.cliente) {
    const nome = clientesById.get(f.cliente)?.nome ?? '—';
    activeChips.push({ key: 'cliente', label: nome });
  }
  if (f.pessoa) {
    const nome = pessoasById.get(f.pessoa)?.nome ?? '—';
    activeChips.push({ key: 'pessoa', label: nome.split(' ')[0] });
  }
  if (f.pri) activeChips.push({ key: 'pri', label: f.pri });
  if (f.prazo) activeChips.push({ key: 'prazo', label: f.prazo === 'atrasadas' ? 'Atrasadas' : f.prazo });
  const nActive = activeChips.length;

  const atrasadasCount = tasks.filter((t) => atrasada(t)).length;
  const totalHoras = tasks.reduce((a, t) => a + (t.esforco || 0), 0);

  const closeSheet = () => setSheetOpen(false);

  return (
    <div className="md:hidden">
      <div className="m-pagetitle">
        <h1>Backlog</h1>
        <div className="narr">
          <b>{tasks.length}</b> abertas
          <span className="sep">·</span>
          <b>{atrasadasCount}</b> atrasadas
          <span className="sep">·</span>
          <b>{totalHoras}h</b>
        </div>
      </div>

      <div className="m-filterbar">
        <label className="m-search">
          <Icon name="search" size={16} className="ic" />
          <input
            type="text"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Buscar tudo…"
          />
        </label>
        <button
          type="button"
          className={cn('m-fbtn', nActive > 0 && 'on')}
          onClick={() => setSheetOpen(true)}
          aria-label="Abrir filtros"
        >
          <Icon name="filter" size={16} />
          {nActive > 0 && <span className="badge">{nActive}</span>}
        </button>
      </div>

      {nActive > 0 && (
        <div className="m-pills" style={{ marginBottom: 12 }}>
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="m-pill on"
              onClick={() => setF({ ...f, [c.key]: '' as never })}
            >
              {c.label}
              <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}

      <div className="m-list">
        {tasks.length === 0 ? (
          <div className="card text-center py-8 px-4">
            <div className="font-brand text-base mb-2 text-ink">Nada por aqui.</div>
            <div className="text-xs text-muted">Tente ajustar os filtros…</div>
          </div>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              cliente={clientesById.get(t.clienteId)?.nome ?? '—'}
              projeto={projetosById.get(t.projetoId)?.nome}
              respNome={pessoasById.get(t.pessoaId)?.nome ?? '—'}
              size="md"
              onClick={() => onOpen(t)}
            />
          ))
        )}
      </div>

      {sheetOpen && (
        <BacklogFilterSheet
          f={f}
          setF={setF}
          clientes={clientesAtivos}
          pessoas={pessoasNaoCliente}
          onClose={closeSheet}
          onClear={() => {
            clearFilters();
            closeSheet();
          }}
        />
      )}
    </div>
  );
}

/** Bottom sheet com filtros do Backlog mobile (Cliente / Resp / Pri / Prazo). */
function BacklogFilterSheet({
  f,
  setF,
  clientes,
  pessoas,
  onClose,
  onClear,
}: {
  f: Filters;
  setF: (next: Filters) => void;
  clientes: Cliente[];
  pessoas: Pessoa[];
  onClose: () => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState<Filters>(f);

  // Esc fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Cycle através das opções (toca pra trocar valor)
  const cycle = (key: keyof Filters, opts: string[]) => () => {
    const cur = String(local[key] ?? '');
    const i = opts.indexOf(cur);
    const next = opts[(i + 1) % opts.length];
    setLocal({ ...local, [key]: next as never });
  };

  const clienteNomes = ['', ...clientes.map((c) => c.id)];
  const pessoaNomes = ['', ...pessoas.map((p) => p.id)];
  const pris = ['', 'P0', 'P1', 'P2', 'P3'];
  const prazos = ['', 'atrasadas', 'hoje', 'semana', 'sem'];

  const labelCliente = local.cliente
    ? (clientes.find((c) => c.id === local.cliente)?.nome ?? '—')
    : 'Todos';
  const labelPessoa = local.pessoa
    ? (pessoas.find((p) => p.id === local.pessoa)?.nome.split(' ')[0] ?? '—')
    : 'Todos';
  const labelPri = local.pri || 'Todas';
  const labelPrazo = local.prazo === 'atrasadas' ? 'Atrasadas'
    : local.prazo === 'hoje' ? 'Hoje'
    : local.prazo === 'semana' ? 'Esta semana'
    : local.prazo === 'sem' ? 'Sem prazo'
    : 'Qualquer';

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filtros do backlog">
        <div className="grab" />
        <h2>Filtros</h2>
        <div className="sh-sub">aplicam à lista do backlog</div>

        <div className="m-group">
          <button type="button" className="m-row" onClick={cycle('cliente', clienteNomes)}>
            <span className="ric"><Icon name="building" size={16} /></span>
            <div className="rbody"><div className="rt">Cliente</div></div>
            <span className="val">{labelCliente}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('pessoa', pessoaNomes)}>
            <span className="ric"><Icon name="users" size={16} /></span>
            <div className="rbody"><div className="rt">Responsável</div></div>
            <span className="val">{labelPessoa}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('pri', pris)}>
            <span className="ric"><Icon name="alert" size={16} /></span>
            <div className="rbody"><div className="rt">Prioridade</div></div>
            <span className="val">{labelPri}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('prazo', prazos)}>
            <span className="ric"><Icon name="calendar" size={16} /></span>
            <div className="rbody"><div className="rt">Prazo</div></div>
            <span className="val">{labelPrazo}</span>
          </button>
        </div>

        <div className="filter-actions">
          <button type="button" className="btn" onClick={onClear}>Limpar</button>
          <button type="button" className="btn btn-primary" onClick={() => { setF(local); onClose(); }}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
