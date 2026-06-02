'use client';

/**
 * ProfileSheet · v1.03 mobile shell
 *
 * Substitui o ProfileMenu (dropdown) em mobile. Bottom sheet com:
 *   - prof-card (avatar + nome + role/email)
 *   - linhas agrupadas: Tema · Manual · Onboarding
 *   - botão Sair (texto vermelho)
 *
 * Fecha em: tap fora · Escape · tap em qualquer linha.
 * Wire-up real:
 *   - Tema     → useTheme().toggle()
 *   - Manual   → useHelp().open()
 *   - Onboarding → useOnboarding().open()
 *   - Sair     → sb.auth.signOut() + redirect /login
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icons';
import { useData } from '@/lib/data-store';
import { useTheme } from '@/components/theme-toggle';
import { useHelp } from '@/components/help-modal';
import { useOnboarding } from '@/components/onboarding-modal';
import { createClient } from '@/lib/supabase/client';
import { APP_VERSION } from '@/components/app-nav';

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { currentPessoa, viewerRole } = useData();
  const { theme, toggle: toggleTheme } = useTheme();
  const { open: openHelp } = useHelp();
  const { open: openOnboarding } = useOnboarding();
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Trava scroll do body enquanto sheet aberto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const nome = currentPessoa?.nome ?? '—';
  const inicial = nome.charAt(0).toUpperCase();
  const role = viewerRole === 'admin' ? 'Admin'
    : viewerRole === 'cliente' ? 'Cliente'
    : 'Interno';
  const isAdmin = viewerRole === 'admin';

  const signOut = async () => {
    await sb.auth.signOut();
    onClose();
    router.replace('/login');
  };

  return (
    <div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label="Menu de perfil">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="prof-card">
          <span className="pa">{inicial}</span>
          <div>
            <div className="pn">{nome}</div>
            <div className="pr">{role} · {currentPessoa?.email ?? ''}</div>
          </div>
        </div>
        <div className="m-group">
          <button
            type="button"
            className="m-row"
            onClick={() => { toggleTheme(); }}
          >
            <span className="ric"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} /></span>
            <div className="rbody">
              <div className="rt">Tema</div>
              <div className="rs">Alterna claro/escuro</div>
            </div>
            <span className="val">{theme === 'dark' ? 'Escuro' : 'Claro'}</span>
          </button>
          <button
            type="button"
            className="m-row"
            onClick={() => { openHelp(); onClose(); }}
          >
            <span className="ric"><Icon name="file" size={16} /></span>
            <div className="rbody">
              <div className="rt">Manual da ferramenta</div>
              <div className="rs">Guia de uso e boas práticas</div>
            </div>
            <Icon name="chevron-right" size={16} className="chev" />
          </button>
          {isAdmin && (
            <button
              type="button"
              className="m-row"
              onClick={() => { openOnboarding(); onClose(); }}
            >
              <span className="ric"><Icon name="help" size={16} /></span>
              <div className="rbody">
                <div className="rt">Onboarding</div>
                <div className="rs">Refazer o tour inicial</div>
              </div>
              <Icon name="chevron-right" size={16} className="chev" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn mt14"
          style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)', borderColor: 'transparent', background: 'transparent' }}
          onClick={signOut}
        >
          <Icon name="logout" size={14} />
          Sair
        </button>
        <div className="text-center mt-2" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-muted)' }}>
          {APP_VERSION}
        </div>
      </div>
    </div>
  );
}
