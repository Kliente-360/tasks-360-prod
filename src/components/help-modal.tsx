'use client';

/**
 * Help / Manual — Onda 0 · 4.B
 *
 * Provider expõe useHelp().open() — vários disparadores (ícone "?" no
 * header desktop, item no profile menu mobile, futuro command palette)
 * compartilham o mesmo modal. Modal montado uma vez no layout.
 *
 * Markdown vem de /docs/HOWTO.md (staff) ou /docs/HOWTO_CLIENTE.md
 * (cliente externo). Cache module-level evita refetch ao reabrir.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/lib/data-store';
import { Icon } from '@/components/icons';

// Lazy-load marked: ~90KB gzipped só pra render de markdown nos modais.
// Carrega só na 1ª vez que o modal abre (dynamic import vira chunk separado).
let markedModule: typeof import('marked') | null = null;
async function getMarked() {
  if (!markedModule) markedModule = await import('marked');
  return markedModule.marked;
}

// ============ Provider ============

type HelpApi = { open: () => void; close: () => void; isOpen: boolean };
const HelpContext = createContext<HelpApi | null>(null);

export function useHelp(): HelpApi {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp precisa de <HelpProvider>');
  return ctx;
}

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const api = useMemo<HelpApi>(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [isOpen],
  );
  return (
    <HelpContext.Provider value={api}>
      {children}
      {isOpen && <HelpModal onClose={() => setIsOpen(false)} />}
    </HelpContext.Provider>
  );
}

type TocItem = { id: string; text: string; depth: number };
type ParsedDoc = { html: string; toc: TocItem[] };

// Cache module-level: persiste enquanto a aba estiver aberta.
const cache = new Map<string, ParsedDoc>();

function slug(s: string): string {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function loadDoc(file: string): Promise<ParsedDoc> {
  const cached = cache.get(file);
  if (cached) return cached;
  const r = await fetch(`/docs/${file}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const md = await r.text();
  // Remove o título/subtítulo top-of-file pra não duplicar com o header
  // do modal (mesma regra do Alpine).
  const cleaned = md
    .replace(/^#\s+tasks 360 — manual do usuário[\s\S]*?\n---\s*\n/m, '')
    .replace(/^#\s+Portal Kliente 360[\s\S]*?\n---\s*\n/m, '')
    .trim();
  const marked = await getMarked();
  const tmp = document.createElement('div');
  tmp.innerHTML = await marked.parse(cleaned, { gfm: true });
  const used = new Set<string>();
  const toc: TocItem[] = [];
  tmp.querySelectorAll('h1, h2').forEach((h) => {
    let id = slug(h.textContent || '');
    if (!id) return;
    let n = 1;
    const base = id;
    while (used.has(id)) {
      id = base + '-' + ++n;
    }
    used.add(id);
    h.id = id;
    toc.push({ id, text: h.textContent || '', depth: parseInt(h.tagName[1] || '1') });
  });
  const out = { html: tmp.innerHTML, toc };
  cache.set(file, out);
  return out;
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { viewerRole } = useData();
  const file = viewerRole === 'cliente' ? 'HOWTO_CLIENTE.md' : 'HOWTO.md';

  const [doc, setDoc] = useState<ParsedDoc | null>(() => cache.get(file) ?? null);
  const [loading, setLoading] = useState(!doc);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (doc) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    loadDoc(file)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message || 'erro desconhecido');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scrollTo = useCallback((id: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div
      className="fixed inset-0 z-[80] bg-[color:var(--modal-bg)] flex items-center justify-center px-2 md:px-4 py-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[color:var(--bg-elev)] border border-line rounded-lg shadow-[var(--shadow-modal)] w-full max-w-[920px] h-[92vh] flex flex-col overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-line flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-brand font-semibold text-base md:text-lg text-ink">Manual · tasks 360</div>
            <span className="text-[10px] uppercase tracking-wider text-muted font-mono hidden md:inline">
              como usar a ferramenta
            </span>
          </div>
          <button
            type="button"
            className="iconbtn text-muted hover:text-ink hover:bg-[color:var(--surface-3)] rounded-md p-1.5 transition-colors"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden grid md:grid-cols-[220px_1fr]">
          {/* TOC desktop */}
          <aside className="hidden md:block border-r border-line overflow-y-auto bg-[color:var(--surface-3)]">
            <div className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted font-mono font-semibold border-b border-line">
              índice
            </div>
            <nav className="py-2 text-sm">
              {doc?.toc.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollTo(h.id);
                  }}
                  className={`block px-4 py-1.5 hover:bg-[color:var(--brand-tint)] hover:text-[color:var(--brand-dark)] transition-colors text-ink-soft ${
                    h.depth === 2 ? 'pl-7' : ''
                  }`}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          </aside>
          {/* Conteúdo */}
          <div ref={scrollRef} className="overflow-y-auto px-5 md:px-8 py-5 md:py-7 bg-[color:var(--bg-elev)]">
            {loading && <div className="text-center text-muted py-12">carregando manual…</div>}
            {err && (
              <div className="text-center py-12">
                <div className="text-[color:var(--danger)] mb-2 inline-flex items-center gap-2 justify-center">
                  <Icon name="alert" size={16} />
                  não foi possível carregar o manual
                </div>
                <div className="text-xs text-muted">{err}</div>
                <a
                  className="btn btn-ghost text-xs mt-3 inline-block"
                  href={`/docs/${file}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  abrir em nova aba
                </a>
              </div>
            )}
            {doc && !err && (
              <article
                className="help-md"
                dangerouslySetInnerHTML={{ __html: doc.html }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Item do profile menu (mobile-only — no desktop o trigger é o ícone "?"
 *  do header). Chama useHelp().open(). */
export function HelpMenuItem({ onClick }: { onClick?: () => void }) {
  const { viewerRole } = useData();
  const { open } = useHelp();
  const label = viewerRole === 'cliente' ? 'Ajuda' : 'Manual da ferramenta';
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        open();
      }}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-ink hover:bg-[color:var(--brand-tint)] transition-colors"
    >
      <span className="whitespace-nowrap inline-flex items-center gap-2">
        <Icon name="help" size={14} />
        {label}
      </span>
    </button>
  );
}

/** Ícone "?" do header (desktop only). */
export function HelpIconButton() {
  const { open } = useHelp();
  return (
    <button
      type="button"
      onClick={open}
      className="btn btn-ghost btn-icon !hidden md:!inline-flex"
      title="Manual da ferramenta"
      aria-label="Ajuda"
    >
      <Icon name="help" size={16} />
    </button>
  );
}
