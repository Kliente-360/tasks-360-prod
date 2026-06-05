'use client';

/**
 * Tema — Onda 0 · 4.D
 *
 * Toggle manual light/dark, persistido em localStorage com mesma chave
 * do app Alpine ('kliente360-theme' — transparente entre as duas
 * versões). Aplica classe `dark` no <html>; o CSS .dark / [data-theme]
 * já existe (foi portado de lib/styles.css).
 *
 * Anti-flash: layout.tsx injeta um script inline no <head> que lê o
 * localStorage e aplica a classe ANTES do paint inicial. ThemeProvider
 * sincroniza o state React com o DOM já preparado.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kliente360-theme';

type ThemeApi = {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
};

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme precisa de <ThemeProvider>');
  return ctx;
}

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark') return 'dark';
  } catch {
    /* ok */
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Aplica no DOM. O script anti-flash do <head> já garantiu o estado
  // inicial; este effect cobre toggles em runtime.
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') html.classList.add('dark');
    else html.classList.remove('dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ok */
    }
  }, [theme]);

  const set = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const api = useMemo<ThemeApi>(() => ({ theme, toggle, set }), [theme, toggle, set]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

// ============ Triggers ============

/** Ícone ☀/☾ no header. Visibilidade controlada pelo pai. */
export function ThemeIconButton({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`btn btn-ghost btn-icon text-xs${className ? ` ${className}` : ''}`}
      title={theme === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
      aria-label="Alternar tema"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  );
}

/** Item do profile menu — mostra estado atual + ação. */
export function ThemeMenuItem({ onClick }: { onClick?: () => void }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        toggle();
      }}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-tint"
    >
      <span>Tema</span>
      <span className="text-muted text-xs whitespace-nowrap">
        {theme === 'dark' ? 'escuro · trocar' : 'claro · trocar'}
      </span>
    </button>
  );
}
