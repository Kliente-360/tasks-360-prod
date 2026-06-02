'use client';

/**
 * Onboarding — Onda 0 · 4.C
 *
 * Modal com 3 perspectivas (CEO, Gerente, Analista) sobre a mesma
 * ferramenta. Markdown vem de /docs/ONBOARDING.md, splitado em 3 blocos
 * por '# CEO', '# Gerente', '# Analista'. Toggle entre personas.
 * Default por viewerRole: admin → CEO, demais → analista.
 *
 * Padrão idêntico ao HelpProvider: provider + useOnboarding() pra
 * vários triggers compartilharem o mesmo modal.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';

// Lazy-load marked: ~90KB gzipped só pra render de markdown nos modais.
let markedModule: typeof import('marked') | null = null;
async function getMarked() {
  if (!markedModule) markedModule = await import('marked');
  return markedModule.marked;
}

type Persona = 'ceo' | 'gerente' | 'analista';
type Personas = Record<Persona, string>;

// Cache module-level
let cached: Personas | null = null;

async function loadOnboarding(): Promise<Personas> {
  if (cached) return cached;
  const marked = await getMarked();
  const r = await fetch('/docs/ONBOARDING.md', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const md = await r.text();
  // Remove preâmbulo (título + blockquote inicial) até a 1ª H1 de persona.
  const cleaned = md.replace(/^[\s\S]*?(?=^# CEO)/m, '').trim();
  // Splita em 3 blocos por '# CEO', '# Gerente', '# Analista' separados
  // por linhas '---'.
  const parts = cleaned.split(/^---\s*$\s*(?=^# (?:CEO|Gerente|Analista))/m);
  const map: Personas = { ceo: '', gerente: '', analista: '' };
  for (const part of parts) {
    const head = part.match(/^# (CEO|Gerente|Analista)/m);
    if (!head) continue;
    const first = head[1].toLowerCase()[0];
    const key: Persona = first === 'c' ? 'ceo' : first === 'g' ? 'gerente' : 'analista';
    // Tira trailer de outras personas se grudou
    const block = part.split(/^---\s*$/m)[0];
    map[key] = await marked.parse(block, { gfm: true });
  }
  cached = map;
  return map;
}

// ============ Provider ============

type OnboardingApi = { open: () => void; close: () => void; isOpen: boolean };
const OnboardingContext = createContext<OnboardingApi | null>(null);

export function useOnboarding(): OnboardingApi {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding precisa de <OnboardingProvider>');
  return ctx;
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const api = useMemo<OnboardingApi>(
    () => ({
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      isOpen,
    }),
    [isOpen],
  );
  return (
    <OnboardingContext.Provider value={api}>
      {children}
      {isOpen && <OnboardingModal onClose={() => setIsOpen(false)} />}
    </OnboardingContext.Provider>
  );
}

// ============ Modal ============

function OnboardingModal({ onClose }: { onClose: () => void }) {
  const { viewerRole } = useData();
  const defaultPersona: Persona = viewerRole === 'admin' ? 'ceo' : 'analista';
  const [persona, setPersona] = useState<Persona>(defaultPersona);
  const [data, setData] = useState<Personas | null>(cached);
  const [loading, setLoading] = useState(!cached);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    loadOnboarding()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setErr(e.message || 'erro desconhecido'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center px-2 md:px-4 py-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-elev border border-line rounded-lg shadow-2xl w-full max-w-[920px] h-[92vh] flex flex-col overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-line flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-brand font-semibold text-base md:text-lg">Onboarding · tasks 360</div>
            <span className="text-[10px] uppercase tracking-wider text-muted font-mono hidden md:inline">
              3 perspectivas
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Toggle persona */}
            <div className="flex rounded-md border border-line overflow-hidden text-sm">
              {(['ceo', 'gerente', 'analista'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPersona(p)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    persona === p
                      ? 'bg-brand-tint font-semibold text-brand-dark'
                      : 'text-ink-soft hover:bg-brand-tint'
                  }`}
                >
                  {p === 'ceo' ? 'CEO' : p}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-muted hover:text-ink text-xl px-2"
              onClick={onClose}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-5 md:py-7">
          {loading && <div className="text-center text-muted py-12">carregando onboarding…</div>}
          {err && (
            <div className="text-center py-12">
              <div className="text-[color:var(--p0)] mb-2">não foi possível carregar o onboarding</div>
              <div className="text-xs text-muted">{err}</div>
              <a
                className="btn btn-ghost text-xs mt-3 inline-block"
                href="/docs/ONBOARDING.md"
                target="_blank"
                rel="noreferrer"
              >
                abrir em nova aba
              </a>
            </div>
          )}
          {data && !err && (
            <article
              className="help-md"
              dangerouslySetInnerHTML={{ __html: data[persona] || '' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Triggers ============

/** Item do profile menu — admin only (cliente externo não vê). */
export function OnboardingMenuItem({ onClick }: { onClick?: () => void }) {
  const { open } = useOnboarding();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        open();
      }}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-tint"
    >
      <span className="whitespace-nowrap">Onboarding</span>
      <span className="text-muted text-xs whitespace-nowrap">3 perfis</span>
    </button>
  );
}
