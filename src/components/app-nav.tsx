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

export const APP_VERSION = 'v1.03.103';

/** Mapeamento de aba → ícone Lucide (handoff §4). */
const TAB_ICON: Record<string, IconName> = {
  '/resumo': 'bar-chart-2',
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
 * AppNav · header do app (desktop + mobile).
 *
 * Desktop (≥md):
 *   [ aperture · tasks 360 ] ... [ Cronômetro | Export · Help · Tema | + Tarefa · Sino · Avatar ]
 *   [ tab tab tab ... ]
 *
 * Mobile (<md):
 *   [ aperture · tasks 360 ] ... [ toggle Resumo/Backlog (admin) · Sino · Avatar ]
 *   — sem tab bar inferior; admin alterna via ícones no header.
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

            {/* Cluster 2: utilitários globais · desktop only */}
            <div className="hidden md:contents">
              {viewerRole === 'admin' && <ExportIconButton />}
              <HelpIconButton />
              <ThemeIconButton className="hidden md:inline-flex" />
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
            <ThemeIconButton className="md:hidden" />
            <NotifBell />
            <ProfileMenu />
          </div>
        </div>

        {/* Desktop tabs — só visível ≥md · filtra por role do viewer (sem
            isso Briefing/Triagem/Cadastros vazam pra interno e cliente). */}
        <nav className="hidden md:flex hdr-v2-tabs">
          {NAV
            .filter((item) => !item.inProfileMenu)
            .filter((item) => !item.mobileOnly)
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

    </>
  );
}
