'use client';

/**
 * Profile menu — Onda 0 · 4.A
 *
 * Avatar com inicial do nome no canto direito do header. Click abre
 * dropdown com:
 *   - "logado como" / nome / email
 *   - Cadastros (admin) — moveu pra cá pq sai da tab bar
 *   - Onboarding (placeholder, vem no 4.C)
 *   - Tema (placeholder, vem no 4.D)
 *   - Ajuda / Manual (placeholder, vem no 4.B)
 *   - Exportar CSV / PDF (placeholders, vem no 4.F)
 *   - Sair (auth.signOut + redirect via middleware)
 *
 * Cada placeholder fica desabilitado com tooltip "em breve" pra o
 * usuário ver onde a feature vai morar quando entrar.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useData } from '@/lib/data-store';
import { createClient } from '@/lib/supabase/client';
import { NAV } from '@/lib/nav';
import { useClickAway } from '@/lib/use-click-away';
import { HelpMenuItem } from '@/components/help-modal';
import { OnboardingMenuItem } from '@/components/onboarding-modal';
import { Icon } from '@/components/icons';
import { APP_VERSION } from '@/components/app-nav';

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { currentPessoa, viewerRole } = useData();
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // Fecha ao clicar fora — useClickAway escuta document mousedown
  // direto, funciona mesmo com o header z-40 acima de overlays.
  const wrapRef = useClickAway<HTMLDivElement>(() => {
    if (open) setOpen(false);
  });

  // Esc fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const initial = (currentPessoa?.nome ?? '?').charAt(0).toUpperCase();
  const isAdmin = viewerRole === 'admin';
  const isCliente = viewerRole === 'cliente';

  const signOut = async () => {
    await sb.auth.signOut();
    setOpen(false);
    router.replace('/login');
  };

  const profileItems = NAV.filter((n) => n.inProfileMenu && n.roles.includes(viewerRole ?? 'interno'));

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="btn btn-ghost btn-icon text-xs"
        onClick={() => setOpen((v) => !v)}
        title={currentPessoa?.nome ?? 'Conta'}
        aria-label="Conta"
        aria-expanded={open}
      >
        <span className="w-6 h-6 rounded-full bg-[color:var(--green-soft)] text-[color:var(--green)] font-brand font-semibold text-xs flex items-center justify-center">
          {initial}
        </span>
      </button>
      {open && (
          <div
            className="fixed md:absolute top-14 md:top-full right-3 md:right-0 mt-0 md:mt-1 bg-[color:var(--bg-elev)] border border-line rounded-lg shadow-xl py-2 w-[260px] max-w-[calc(100vw-24px)] md:w-[260px] z-50"
          >
            {/* 1. Identidade — apenas nome + email, sem "logado como" */}
            <div className="px-3 pt-2 pb-0.5 text-sm font-medium text-ink truncate">
              {currentPessoa?.nome ?? '—'}
            </div>
            <div className="px-3 pb-2 text-[11px] text-muted font-mono truncate">
              {currentPessoa?.email ?? ''}
            </div>

            {/* 2. Cadastros — mini-seção isolada logo após identidade.
                Vive aqui porque tem inProfileMenu: true. profileItems já
                vem filtrado por role (NAV.filter na linha 58), então
                length>0 sozinho cobre o gate de admin. */}
            {profileItems.length > 0 && (
              <>
                <div className="border-t border-line my-1" />
                {profileItems.map((item) => (
                  <MenuButton
                    key={item.href}
                    label={item.label}
                    onClick={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                  />
                ))}
              </>
            )}

            {/* 3. Mini-seção: Manual (mobile) + Onboarding.
                Onboarding aparece pra qualquer usuário staff (admin
                ou interno) — não-cliente. No desktop só Onboarding;
                Manual tem ícone "?" no header. */}
            {!isCliente && (
              <>
                <div className="border-t border-line my-1" />
                <div className="md:hidden">
                  <HelpMenuItem onClick={() => setOpen(false)} />
                </div>
                <OnboardingMenuItem onClick={() => setOpen(false)} />
              </>
            )}

            {/* 6. Sair */}
            <div className="border-t border-line my-1" />
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left px-3 py-2 text-sm text-[color:var(--danger)] hover:bg-[color:var(--danger-soft)] transition-colors"
              onClick={signOut}
            >
              <Icon name="logout" size={14} />
              <span>Sair</span>
            </button>

            {/* 7. Versão */}
            <div className="border-t border-line my-1" />
            <div className="px-3 pt-1 pb-0.5 text-[10px] text-muted font-mono text-right">
              {APP_VERSION}
            </div>
          </div>
      )}
    </div>
  );
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-ink hover:bg-[color:var(--surface-3)] transition-colors"
    >
      <span>{label}</span>
    </button>
  );
}

function MenuItem({
  label,
  hint,
  right,
  disabled,
}: {
  label: string;
  hint?: string;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-ink ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[color:var(--surface-3)] cursor-pointer transition-colors'
      }`}
      title={disabled ? hint : undefined}
    >
      <span>{label}</span>
      {right ?? (hint && <span className="text-muted text-xs whitespace-nowrap">{hint}</span>)}
    </div>
  );
}
