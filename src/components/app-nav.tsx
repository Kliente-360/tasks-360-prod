'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { ProfileMenu } from '@/components/profile-menu';
import { HelpIconButton } from '@/components/help-modal';
import { ThemeIconButton } from '@/components/theme-toggle';
import { ExportIconButton } from '@/components/export';
import { NotifBell } from '@/components/notif-bell';

const APP_VERSION = 'v1.02.204';

/** Barra de navegação superior — espelha o header do app Alpine. */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshAll, refreshing } = useData();
  const { openNew } = useTaskModal();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const currentTab = NAV.find((n) => pathname.startsWith(n.href));

  return (
    <header
      className="bg-elev border-b border-line sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Top row: logo + actions */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
        {/* Logo · click dispara refetch (mesmo gesto do app Alpine). */}
        <button
          type="button"
          onClick={() => refreshAll()}
          className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity"
          title="Recarregar dados"
          aria-label="Recarregar dados"
        >
          <div className={cn('k360-mark', refreshing && 'loading-pulse')}>
            <span /><span /><span /><span />
          </div>
          <div className="leading-none min-w-0 text-left">
            <div className="font-brand text-[18px] md:text-[22px] font-semibold text-brand">
              tasks 360
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted mt-1 truncate font-mono">
              {refreshing ? 'atualizando…' : APP_VERSION}
            </div>
          </div>
        </button>

        {/* Right actions — "+ task" também no mobile (igual Alpine) +
            ProfileMenu (avatar). Notificações e tema entram no header
            ao lado do "+ task" nos blocos 4.D / 4.E. */}
        {/* Ordem espelha o Alpine:
            DESKTOP: Export · Help · Tema · | · + task · Notif · Avatar
            MOBILE : + task · Notif · Avatar (ícones extras vivem no
                     profile menu mobile). */}
        <div className="flex items-center gap-1 shrink-0">
          <ExportIconButton />
          <HelpIconButton />
          <ThemeIconButton />
          <div className="w-px h-6 bg-line mx-1 md:mx-2 hidden md:block" />
          <div className="hidden md:block">
            <button
              type="button"
              onClick={openNew}
              className="btn btn-primary btn-fixed-w text-xs"
              title="Nova tarefa"
              aria-label="Nova tarefa"
            >
              + task
            </button>
          </div>
          <NotifBell />
          <ProfileMenu />
        </div>
      </div>

      {/* Mobile: dropdown com tab atual + lista pra trocar */}
      <div className="md:hidden border-t border-line relative">
        <button
          className="w-full flex items-center justify-between px-4 py-3"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Menu de navegação"
        >
          <span className="font-brand font-semibold text-sm">{currentTab?.label ?? 'tasks 360'}</span>
          <span className="text-muted text-sm">{mobileNavOpen ? '▴' : '▾'}</span>
        </button>
        {mobileNavOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 right-0 top-full bg-elev border-b border-line shadow-lg z-30">
              {NAV.filter((item) => !item.hideMobile && !item.inProfileMenu).map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <button
                    key={item.href}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 border-b border-line last:border-0 transition-colors',
                      active ? 'bg-brand-tint text-brand-dark font-medium' : 'hover:bg-bg-elev',
                    )}
                    onClick={() => {
                      setMobileNavOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <span className="text-sm">{item.label}</span>
                    {active && <span className="text-brand text-xs">●</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Desktop: tabs horizontais — filtra `inProfileMenu` (Cadastros
          vive no dropdown do avatar agora). */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 tabs-row hidden md:flex">
        {NAV.filter((item) => !item.inProfileMenu).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('tab', active && 'active')}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
