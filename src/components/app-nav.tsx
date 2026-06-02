'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useData } from '@/lib/data-store';
import { useTaskModal } from '@/components/task-modal';
import { ProfileMenu } from '@/components/profile-menu';
import { HelpIconButton } from '@/components/help-modal';
import { ThemeIconButton } from '@/components/theme-toggle';
import { ExportIconButton } from '@/components/export';
import { NotifBell } from '@/components/notif-bell';
import { TimerButton } from '@/components/timer-button';
import { Icon, type IconName } from '@/components/icons';

export const APP_VERSION = 'v1.03.030';

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

/**
 * Tabs mobile · ordem fixa do handoff mobile §2.2.
 * 5 abas (Briefing · Foco · Backlog · Dashboard · Portal). Filtra
 * por role usando NAV — cliente externo só vê Portal, interno não vê
 * Briefing, admin vê tudo.
 */
const MOBILE_TAB_ORDER = ['/briefing', '/foco', '/backlog', '/dashboard', '/portal'] as const;

/**
 * AppNav · header do app (desktop + mobile).
 *
 * Desktop (≥md):
 *   [ aperture · tasks 360 ] ... [ Cronômetro | Export · Help · Tema | + Tarefa · Sino · Avatar ]
 *   [ tab tab tab ... ]
 *
 * Mobile (<md):
 *   [ aperture · tasks 360 ] ... [ Sino · Avatar ]   ← header reduzido
 *   <tab bar inferior fixa>                          ← 5 abas
 *
 * Toda alternância é via classes Tailwind (`hidden md:flex` / `md:hidden`)
 * — nada de matchMedia em render pra evitar hidratação mismatch.
 */
export function AppNav() {
  const pathname = usePathname();
  const { refreshAll, refreshing, viewerRole } = useData();
  const { openNew } = useTaskModal();

  // Abas mobile filtradas por role, na ordem do handoff
  const mobileTabs = MOBILE_TAB_ORDER
    .map((href) => NAV.find((n) => n.href === href))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .filter((n) => !viewerRole || n.roles.includes(viewerRole));

  return (
    <>
      <header className="hdr-v2">
        {/* Top row: brand + actions */}
        <div className="hdr-v2-top">
          {/* Brand · click no logo dispara refetch (mesmo gesto do Alpine) */}
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

          {/* Actions */}
          <div className="hdr-actions">
            {/* Cluster 1: Cronômetro · desktop only */}
            <div className="hidden md:flex items-center gap-1">
              <TimerButton />
            </div>
            <span className="hdr-sep hidden md:block" />

            {/* Cluster 2: utilitários globais · desktop only no mobile */}
            <div className="hidden md:contents">
              <ExportIconButton />
              <HelpIconButton />
              <ThemeIconButton />
            </div>

            <span className="hdr-sep hidden md:block" />

            {/* Cluster 3: criar + notif + avatar */}
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

        {/* Desktop tabs — só visível ≥md */}
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

      {/* ============ Tab bar inferior · mobile only ============
          Posicionada fixed bottom via CSS (.m-tabbar). 5 abas na ordem
          do handoff. Cliente externo vê só Portal — o filtro por role
          remove as outras automaticamente. */}
      <nav className="m-tabbar md:hidden" role="navigation" aria-label="Navegação principal">
        {mobileTabs.map((item) => {
          const active = pathname.startsWith(item.href);
          const ic = TAB_ICON[item.href] ?? 'list';
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('m-tab', active && 'on')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={ic} size={20} className="ic" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
