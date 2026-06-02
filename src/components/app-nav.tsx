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
import { TimerButton } from '@/components/timer-button';
import { Icon, type IconName } from '@/components/icons';

export const APP_VERSION = 'v1.02.233';

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
 * AppNav · header do app pós design system (F2).
 * Anatomia (handoff §4):
 *   [ aperture · tasks 360 ] ... [ Cronômetro | Export · Help · Tema | + Tarefa · Sino · Avatar ]
 *   [ tab tab tab ... ]
 *
 * - Frosted glass (rgba bg + backdrop-filter blur)
 * - Mark aperture com opacidade gradiente (4 círculos: .45/.65/.85/1.0)
 * - Clusters de ação separados por `.hdr-sep`
 * - Tabs com ícone Lucide + cor verde editorial quando ativa
 * - Versão saiu do header (vive no menu do perfil; constante exportada
 *   pra outros consumidores ainda referenciam)
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { refreshAll, refreshing } = useData();
  const { openNew } = useTaskModal();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const currentTab = NAV.find((n) => pathname.startsWith(n.href));

  return (
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

        {/* Actions · 3 clusters separados por hdr-sep */}
        <div className="hdr-actions">
          {/* Cluster 1: Cronômetro · desktop only */}
          <div className="hidden md:flex items-center gap-1">
            <TimerButton />
          </div>
          <span className="hdr-sep hidden md:block" />

          {/* Cluster 2: utilitários globais */}
          <ExportIconButton />
          <HelpIconButton />
          <ThemeIconButton />

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

      {/* Mobile: dropdown com tab atual + lista pra trocar */}
      <div className="md:hidden border-t border-line relative">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3"
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Menu de navegação"
        >
          <span className="flex items-center gap-2 font-medium text-sm">
            {currentTab && (
              <Icon
                name={TAB_ICON[currentTab.href] ?? 'list'}
                size={15}
                className="text-[color:var(--green)]"
              />
            )}
            {currentTab?.label ?? 'tasks 360'}
          </span>
          <Icon name={mobileNavOpen ? 'chevron-down' : 'chevron-down'} size={14} className="text-muted" />
        </button>
        {mobileNavOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMobileNavOpen(false)} />
            <div className="absolute left-0 right-0 top-full bg-bg-elev border-b border-line shadow-lg z-30">
              {NAV.filter((item) => !item.hideMobile && !item.inProfileMenu).map((item) => {
                const active = pathname.startsWith(item.href);
                const ic = TAB_ICON[item.href] ?? 'list';
                return (
                  <button
                    key={item.href}
                    type="button"
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 border-b border-line last:border-0 transition-colors',
                      active ? 'bg-[color:var(--green-soft)] text-[color:var(--green)] font-medium' : 'hover:bg-bg-elev',
                    )}
                    onClick={() => {
                      setMobileNavOpen(false);
                      router.push(item.href);
                    }}
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <Icon name={ic} size={15} />
                      {item.label}
                    </span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--green)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Desktop tabs — uma linha com ícone + label, ativa em verde */}
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
  );
}
