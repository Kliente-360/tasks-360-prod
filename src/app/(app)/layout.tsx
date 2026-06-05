import { AppNav } from '@/components/app-nav';
import { DataProvider } from '@/lib/data-store';
import { TimerProvider } from '@/lib/use-timer';
import { TaskModalProvider } from '@/components/task-modal';
import { ToastProvider } from '@/components/toast';
import { HelpProvider } from '@/components/help-modal';
import { OnboardingProvider } from '@/components/onboarding-modal';
import { ThemeProvider } from '@/components/theme-toggle';
import { CommandPaletteProvider } from '@/components/command-palette';
import { QuickCaptureProvider } from '@/components/quick-capture';
import { GlobalShortcuts } from '@/components/global-shortcuts';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { AppSplash } from '@/components/app-splash';
import { MobileFab } from '@/components/mobile-fab';
import { BadgeSync } from '@/components/badge-sync';
import { MobileTabShell } from '@/components/mobile-tab-shell';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <DataProvider>
          <TimerProvider>
          <HelpProvider>
            <OnboardingProvider>
              <TaskModalProvider>
                <QuickCaptureProvider>
                  <CommandPaletteProvider>
                    <GlobalShortcuts />
                    <ServiceWorkerRegister />
                    <AppSplash />
                    <div className="min-h-screen">
                      <AppNav />
                      {/* Main alinha EXATAMENTE com .hdr-v2-top: max-width 1320px
                          (var(--container)) + padding 16px. Conteúdo começa no mesmo X
                          do logo aperture e termina no mesmo X do avatar/perfil.
                          app-main-mobile-safe reserva padding-bottom em mobile pra
                          conteúdo não ficar atrás da .m-tabbar fixa. */}
                      <MobileTabShell>{children}</MobileTabShell>
                    </div>
                    <MobileFab />
                    <BadgeSync />
                  </CommandPaletteProvider>
                </QuickCaptureProvider>
              </TaskModalProvider>
            </OnboardingProvider>
          </HelpProvider>
          </TimerProvider>
        </DataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

