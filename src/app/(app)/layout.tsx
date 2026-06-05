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
import { MobileHelpProvider } from '@/components/mobile-help-modal';

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
                    <MobileHelpProvider>
                    <GlobalShortcuts />
                    <ServiceWorkerRegister />
                    <AppSplash />
                    <div className="min-h-screen">
                      <AppNav />
                      {/* Main alinha com .hdr-v2-top: max-width 1320px + padding 16px.
                          app-main-mobile-safe reserva padding-bottom p/ FAB mobile. */}
                      <MobileTabShell>{children}</MobileTabShell>
                    </div>
                    <MobileFab />
                    <BadgeSync />
                    </MobileHelpProvider>
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

