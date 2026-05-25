'use client';

/**
 * Command Palette — Onda 0 · 4.G
 *
 * Atalho global ⌘K (Mac) / Ctrl+K abre overlay com busca fuzzy entre:
 *   - Tasks (titulo + descricao)
 *   - Clientes / Projetos / Pessoas (filtram backlog)
 *   - Ações (nova task, captura rápida, exportar CSV, manual, tema, etc)
 *   - Navegação (ir pra cada aba)
 *
 * Enter executa, ↑/↓ navega, ESC fecha.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { useQuickCapture } from '@/components/quick-capture';
import { useHelp } from '@/components/help-modal';
import { useOnboarding } from '@/components/onboarding-modal';
import { useTheme } from '@/components/theme-toggle';
import { useExportCsv } from '@/components/export';
import { CLEAR_FILTERS_EVENT } from '@/lib/events';
import { NAV } from '@/lib/nav';
import { lblStatus } from '@/lib/task-utils';

type Item = {
  id: string;
  kind: string;
  label: string;
  hint?: string;
  action: () => void;
};

type Api = { open: () => void; close: () => void; isOpen: boolean };
const Ctx = createContext<Api | null>(null);
export function useCommandPalette(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCommandPalette precisa de <CommandPaletteProvider>');
  return c;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const api = useMemo<Api>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
    [isOpen],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      {isOpen && <Palette onClose={() => setIsOpen(false)} />}
    </Ctx.Provider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { tasks, clientes, projetos, pessoas, refreshAll } = useData();
  const { openEdit, openNew } = useTaskModal();
  const { open: openQuick } = useQuickCapture();
  const helpApi = useHelp();
  const onbApi = useOnboarding();
  const { toggle: toggleTheme } = useTheme();
  const exportCsv = useExportCsv();

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo<Item[]>(() => {
    const query = q.toLowerCase().trim();
    const out: Item[] = [];

    // ===== Tasks (limita pra não inflar) =====
    const tlimit = query ? 30 : 8;
    const taskMatches = tasks
      .filter((t) => !t.arquivadoEm)
      .filter(
        (t) =>
          !query ||
          (t.titulo || '').toLowerCase().includes(query) ||
          (t.descricao || '').toLowerCase().includes(query),
      )
      .slice(0, tlimit);
    for (const t of taskMatches) {
      const cli = clientes.find((c) => c.id === t.clienteId)?.nome ?? '—';
      const proj = projetos.find((p) => p.id === t.projetoId)?.nome ?? '—';
      out.push({
        id: 'task-' + t.id,
        kind: 'tarefa',
        label: t.titulo,
        hint: `${cli} · ${proj} · ${lblStatus(t.status)}`,
        action: () => openEdit(t.id),
      });
    }

    // ===== Clientes =====
    for (const c of clientes.filter((c) => !c.arquivadoEm)) {
      if (!query || c.nome.toLowerCase().includes(query)) {
        out.push({
          id: 'cli-' + c.id,
          kind: 'cliente',
          label: c.nome,
          hint: 'ir pro backlog deste cliente',
          action: () => router.push(`/backlog?cliente=${c.id}`),
        });
      }
    }

    // ===== Projetos =====
    for (const p of projetos.filter((p) => !p.arquivadoEm)) {
      if (!query || p.nome.toLowerCase().includes(query)) {
        const cli = clientes.find((c) => c.id === p.clienteId)?.nome ?? '—';
        out.push({
          id: 'proj-' + p.id,
          kind: 'projeto',
          label: p.nome,
          hint: `${cli} · ir pro backlog`,
          action: () => router.push(`/backlog?cliente=${p.clienteId}&projeto=${p.id}`),
        });
      }
    }

    // ===== Pessoas =====
    for (const p of pessoas.filter((p) => p.role !== 'cliente')) {
      if (!query || p.nome.toLowerCase().includes(query)) {
        out.push({
          id: 'pes-' + p.id,
          kind: 'pessoa',
          label: p.nome,
          hint: 'ir pro backlog deste responsável',
          action: () => router.push(`/backlog?pessoa=${p.id}`),
        });
      }
    }

    // ===== Ações + Navegação =====
    const actions: Item[] = [
      { id: 'act-new', kind: 'ação', label: 'Nova tarefa', hint: 'abrir formulário · n', action: openNew },
      { id: 'act-quick', kind: 'ação', label: 'Captura rápida', hint: 'criar tarefa em 2s', action: openQuick },
      { id: 'act-csv', kind: 'export', label: 'Exportar CSV', hint: 'tarefas pra Excel', action: exportCsv },
      {
        id: 'act-clear',
        kind: 'ação',
        label: 'Limpar filtros',
        hint: 'reset da tela atual · g+l',
        action: () => window.dispatchEvent(new CustomEvent(CLEAR_FILTERS_EVENT)),
      },
      { id: 'act-manual', kind: 'ação', label: 'Manual da ferramenta', hint: 'HOWTO completo', action: helpApi.open },
      { id: 'act-onb', kind: 'ação', label: 'Onboarding', hint: '3 perspectivas', action: onbApi.open },
      { id: 'act-theme', kind: 'ação', label: 'Alternar tema', hint: 'claro / escuro', action: toggleTheme },
      { id: 'act-reload', kind: 'ação', label: 'Recarregar dados', hint: 'refetch silencioso', action: refreshAll },
    ];
    // Navegação por tab (NAV)
    for (const n of NAV) {
      actions.push({
        id: 'nav-' + n.href,
        kind: 'ir pra',
        label: n.label,
        hint: n.href,
        action: () => router.push(n.href),
      });
    }
    for (const a of actions) {
      const hay = (a.label + ' ' + (a.hint || '')).toLowerCase();
      if (!query || hay.includes(query)) out.push(a);
    }

    return out.slice(0, 50);
  }, [q, tasks, clientes, projetos, pessoas, router, openEdit, openNew, openQuick, exportCsv, helpApi.open, onbApi.open, toggleTheme, refreshAll]);

  // Garante idx válido quando results encolhe
  useEffect(() => {
    if (idx >= results.length) setIdx(Math.max(0, results.length - 1));
  }, [results.length, idx]);

  const select = useCallback(
    (i: number) => {
      const item = results[i];
      if (!item) return;
      onClose();
      // Defer pra não conflitar com unmount durante a action.
      setTimeout(() => item.action(), 0);
    },
    [results, onClose],
  );

  // Scroll do item ativo
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-idx="${idx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  // Atalhos do palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => Math.min(results.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        select(idx);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [results, idx, select, onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] px-3 palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette-shell w-full max-w-[640px]">
        <div className="palette-header">
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            placeholder="Buscar tarefa, cliente, ação… (⌘K)"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="palette-kbd">ESC</span>
        </div>
        <div ref={listRef} className="palette-list">
          {results.length === 0 ? (
            <div className="palette-empty-title px-4 py-8 text-center text-muted text-sm italic">
              Sem resultados.
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                data-idx={i}
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => select(i)}
                className={`palette-row ${i === idx ? 'is-active' : ''}`}
              >
                <span className="palette-kind">{r.kind}</span>
                <span className="palette-label">{r.label}</span>
                {r.hint && <span className="palette-hint">{r.hint}</span>}
              </button>
            ))
          )}
        </div>
        <div className="palette-count">
          {results.length} resultado{results.length === 1 ? '' : 's'} · ↑↓ navegar · ↵ abrir · ESC fechar
        </div>
      </div>
    </div>
  );
}
