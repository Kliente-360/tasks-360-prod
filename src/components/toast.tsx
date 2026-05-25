'use client';

/**
 * Toast system — Onda 0 · 2.8.2
 *
 * Substitui alert() / mensagens informativas por toasts não-bloqueantes.
 * Stack no canto bottom-right (desktop) e top (mobile) pra não conflitar
 * com a bulk bar fixa no rodapé.
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success('Salvo.');
 *   toast.error('Falhou: ' + err);
 *   toast.info('5 tarefas movidas.');
 *
 * `confirm()` continua nativo por ora — substituir por modal próprio é
 * outro escopo (pode entrar no 2.8.3 ou polimento futuro).
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  msg: string;
  /** ms até auto-dismiss. 0 = sticky (não some sozinho). */
  duration: number;
};

type ToastApi = {
  success: (msg: string, duration?: number) => void;
  error: (msg: string, duration?: number) => void;
  info: (msg: string, duration?: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Retorna funções com identidade estável (via ref interno) — assim
 * dependencies de useCallback/useEffect podem incluir `toast` sem que
 * o linter reclame de mudança a cada render do Provider.
 * Internamente delega pra implementação atual do contexto.
 */
function buildStableApi(ref: React.MutableRefObject<ToastApi>): ToastApi {
  return {
    success: (msg, d) => ref.current.success(msg, d),
    error: (msg, d) => ref.current.error(msg, d),
    info: (msg, d) => ref.current.info(msg, d),
  };
}

const NOOP_API: ToastApi = {
  success: () => {},
  error: () => {},
  info: () => {},
};

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa de <ToastProvider>');
  const ref = useRef<ToastApi>(ctx);
  ref.current = ctx;
  return useMemo(() => buildStableApi(ref), []);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seqRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, msg: string, duration = 4500) => {
      const id = ++seqRef.current;
      setItems((cur) => [...cur, { id, kind, msg, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  // Memoizar a API mantém a referência estável entre renders — assim
  // useCallback/useEffect que recebem `toast` como dependency não
  // disparam loops nem warning de "missing dep".
  const api = useMemo<ToastApi>(
    () => ({
      success: (msg, d) => push('success', msg, d),
      error: (msg, d) => push('error', msg, d ?? 8000), // erros ficam mais tempo
      info: (msg, d) => push('info', msg, d),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="fixed z-[60] flex flex-col gap-2 pointer-events-none
                   top-3 left-3 right-3 md:top-auto md:left-auto
                   md:bottom-4 md:right-4 md:w-[360px] md:max-w-[calc(100vw-32px)]"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind} pointer-events-auto`}
            role="status"
          >
            <span className="flex-1 leading-snug">{t.msg}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Variante "safe" — fora do provider retorna no-op em vez de jogar erro.
 * Útil em componentes compartilhados (modais montados em testes etc).
 * Também retorna funções estáveis via ref.
 */
export function useToastSafe(): ToastApi {
  const ctx = useContext(ToastContext);
  const ref = useRef<ToastApi>(ctx ?? NOOP_API);
  ref.current = ctx ?? NOOP_API;
  return useMemo(() => buildStableApi(ref), []);
}
