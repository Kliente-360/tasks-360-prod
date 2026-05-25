import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — Onda 0 · 4.J
 *
 * Smoke tests visuais (auth-less). Sobe o servidor Next em prod build
 * (mais perto do deploy real que `next dev`) e roda 1 navegador.
 *
 * Em CI, env vars de Supabase devem existir com placeholders — o app
 * boota mesmo sem backend real desde que NEXT_PUBLIC_SUPABASE_URL e
 * NEXT_PUBLIC_SUPABASE_ANON_KEY estejam definidos (qualquer valor).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Usa `next dev` em vez de `build && start` — mais rápido e evita um
    // bug do Next 15 quando o repo está num path com espaços (iCloud Drive
    // local). Pra smoke test auth-less o resultado é equivalente.
    command: 'npm run dev -- -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
