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
                      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6">{children}</main>
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

