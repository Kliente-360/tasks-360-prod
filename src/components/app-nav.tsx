'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { ProfileMenu } from '@/components/profile-menu';
import { ProfileSheet } from '@/components/profile-sheet';
import { HelpIconButton } from '@/components/help-modal';
import { ThemeIconButton } from '@/components/theme-toggle';
import { ExportIconButton } from '@/components/export';
import { NotifBell } from '@/components/notif-bell';
import { TimerButton } from '@/components/timer-button';
import { Icon, type IconName } from '@/components/icons';

export const APP_VERSION = 'v1.03.009';

/** Mapeamento de aba → ícone Lucide (handoff §4). */
const TAB_ICON: Record<string, IconName> = {
  '/foco': 'target',
  '/briefing': 'file',
  '/triagem': 'inbox',
  '/backlog': 'list',
  '/kanban': 'columns',
  '/calendario': 'calendar',
  '/dashboard': 'grid',
  '/portal': 'building',
  '/timesheet': 'timer',
  '/cadastros': 'sliders',
};

/** Ordem fixa da tab bar mobile (handoff §2.2): Briefing · Foco · Backlog · Dashboard · Portal */
const MOBILE_TABS = ['/briefing', '/foco', '/backlog', '/dashboard', '/portal'] as const;

/**
 * AppNav · header do app pós design system (F2 + v1.03 mobile shell).
 *
 * Desktop (>860px): header completo + tabs horizontais (mesma anatomia do v1.02).
 * Mobile (≤860px): header reduzido [aperture + tasks 360 ... sino · avatar] +
 *   tab bar inferior fixa com 5 itens (Briefing · Foco · Backlog · Dashboard · Portal).
 *   Avatar abre ProfileSheet (bottom sheet) em vez do dropdown desktop.
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshAll, refreshing, currentPessoa, viewerRole } = useData();
  const { openNew } = useTaskModal();
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  const initial = (currentPessoa?.nome ?? '?').charAt(0).toUpperCase();

  // Filtra tabs mobile pelo role do viewer (briefing é admin-only etc.)
  const role = viewerRole ?? 'interno';
  const visibleMobileTabs = MOBILE_TABS.filter((href) => {
    const item = NAV.find((n) => n.href === href);
    return item && item.roles.includes(role);
  });

  return (
    <>
      {/* ===== Header MOBILE (≤860px) — só logo + bell + avatar ===== */}
      <header className="m-header">
        <button
          type="button"
          onClick={() => refreshAll()}
          className="brand bg-transparent border-0 cursor-pointer p-0"
          aria-label="Recarregar dados"
        >
          <span className={cn('mark sz-24', refreshing && 'loading-pulse')}>
            <span /><span /><span /><span />
          </span>
          <b>tasks 360</b>
        </button>
        <span className="sp" />
        <NotifBell />
        <button
          type="button"
          className="m-prof"
          onClick={() => setProfileSheetOpen(true)}
          aria-label="Perfil"
          title={currentPessoa?.nome ?? 'Conta'}
        >
          {initial}
        </button>
      </header>

      {/* ===== Header DESKTOP — mesma anatomia v1.02 ===== */}
      <header className="hdr-v2">
        <div className="hdr-v2-top">
          <button
            type="button"
            onClick={() => refreshAll()}
            className="hdr-brand min-w-0 text-left bg-transparent border-0 cursor-pointer"
            title="Recarregar dados"
            aria-label="Recarregar dados"
          >
            <span className={cn('mark sz-24', refreshing && 'loading-pulse')}>
              <span /><span /><span /><span />
            </span>
            <b className="leading-none truncate">tasks 360</b>
          </button>

          <span className="hdr-spacer" />

          <div className="hdr-actions">
            <div className="hidden md:flex items-center gap-1">
              <TimerButton />
            </div>
            <span className="hdr-sep hidden md:block" />

            <ExportIconButton />
            <HelpIconButton />
            <ThemeIconButton />

            <span className="hdr-sep hidden md:block" />

            <button
              type="button"
              onClick={openNew}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[color:var(--green)] text-white text-xs font-medium hover:bg-[color:var(--green-hover)] transition-colors"
              title="Nova tarefa"
              aria-label="Nova tarefa"
            >
              <Icon name="plus" size={14} />
              Tarefa
            </button>
            <NotifBell />
            <ProfileMenu />
          </div>
        </div>

        {/* Desktop tabs (escondido em ≤860px pelo CSS .m-tabbar e .hdr-v2-tabs) */}
        <nav className="hidden md:flex hdr-v2-tabs">
          {NAV.filter((item) => !item.inProfileMenu).map((item) => {
            const active = pathname.startsWith(item.href);
            const ic = TAB_ICON[item.href] ?? 'list';
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('tab-v2', active && 'active')}
              >
                <Icon name={ic} size={15} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ===== Tab bar MOBILE inferior fixa ===== */}
      <nav className="m-tabbar" aria-label="Navegação mobile">
        {visibleMobileTabs.map((href) => {
          const item = NAV.find((n) => n.href === href);
          if (!item) return null;
          const active = pathname.startsWith(href);
          const ic = TAB_ICON[href] ?? 'list';
          return (
            <button
              key={href}
              type="button"
              className={cn('m-tab', active && 'on')}
              onClick={() => router.push(href)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={ic} size={22} className="ic" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {profileSheetOpen && (
        <ProfileSheet onClose={() => setProfileSheetOpen(false)} />
      )}
    </>
  );
}
