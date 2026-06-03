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
import { isPreTriagem, triageFailures } from '@/lib/task-utils';
import { STATUS } from '@/lib/task-constants';
import { useMemo } from 'react';
import { useFocoDone } from '@/lib/use-foco-done';
import { computeFocoCount } from '@/app/(app)/foco/foco-client';

export const APP_VERSION = 'v1.03.077';

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
  const { refreshAll, refreshing, viewerRole, tasks, currentPessoa } = useData();
  const { openNew } = useTaskModal();
  const { isResolved } = useFocoDone();

  // Counter da Triagem · mesma lógica de triagemTasks (failures OU IA pre-triagem).
  // Bolinha vermelha aparece ao lado do label da aba.
  const triagemCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (t.arquivadoEm) return false;
        if (t.status === STATUS.CONCLUIDO) return false;
        return isPreTriagem(t) || triageFailures(t).length > 0;
      }).length,
    [tasks],
  );

  // Counter do Foco · soma das 5 contextos imediatamente computáveis
  // (atrasadas + hoje + bloqueadas + sem_esforco + sem_horas) descontado
  // os marcados como Resolvido hoje. "Sem comment" precisa query async →
  // não entra na bolinha (continua aparecendo na seção própria).
  const focoCount = useMemo(
    () => computeFocoCount({ tasks, pessoaId: currentPessoa?.id ?? null, isResolved }),
    [tasks, currentPessoa?.id, isResolved],
  );

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
              {viewerRole === 'admin' && <ExportIconButton />}
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

        {/* Desktop tabs — só visível ≥md · filtra por role do viewer (sem
            isso Briefing/Triagem/Cadastros vazam pra interno e cliente). */}
        <nav className="hidden md:flex hdr-v2-tabs">
          {NAV
            .filter((item) => !item.inProfileMenu)
            .filter((item) => !viewerRole || item.roles.includes(viewerRole))
            .map((item) => {
            const active = pathname.startsWith(item.href);
            const ic = TAB_ICON[item.href] ?? 'list';
            const badgeCount =
              item.href === '/triagem' && triagemCount > 0
                ? triagemCount
                : item.href === '/foco' && focoCount > 0
                  ? focoCount
                  : 0;
            const badgeTitle =
              item.href === '/triagem'
                ? `${badgeCount} aguardando triagem`
                : `${badgeCount} pendentes no seu foco hoje`;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('tab-v2', active && 'active')}
              >
                <Icon name={ic} size={15} />
                {item.label}
                {badgeCount > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 rounded-full text-[9px] font-bold text-white px-1"
                    style={{ background: 'var(--danger)' }}
                    title={badgeTitle}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
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
          const badgeCount = item.href === '/foco' && focoCount > 0 ? focoCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('m-tab relative', active && 'on')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon name={ic} size={20} className="ic" />
              <span>{item.label}</span>
              {badgeCount > 0 && (
                <span
                  className="absolute top-1 right-3 inline-flex items-center justify-center min-w-[14px] h-[14px] rounded-full text-[8px] font-bold text-white px-1"
                  style={{ background: 'var(--danger)' }}
                >
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
