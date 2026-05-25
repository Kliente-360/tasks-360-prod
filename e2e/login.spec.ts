import { test, expect } from '@playwright/test';

/**
 * Smoke test auth-less — Onda 0 · 4.J
 *
 * Não tenta logar (não temos seed de usuário em CI). Só verifica:
 *   1) Rota raiz redireciona pro login quando não autenticado.
 *   2) Página de login renderiza com formulário esperado.
 *   3) Middleware bloqueia rota privada (/backlog) sem sessão.
 *
 * Pega regressões grossas: build quebrado, middleware quebrado, login
 * page com erro de hidratação, etc.
 */

test.describe('smoke · auth-less', () => {
  test('raiz redireciona pra /login sem sessão', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('página de login renderiza', async ({ page }) => {
    await page.goto('/login');
    // Brand visível (exact pra não casar com <title>).
    await expect(page.getByText('tasks 360', { exact: true })).toBeVisible();
    // Input de email do magic link (sem aria-label; localiza por placeholder).
    await expect(page.getByPlaceholder(/empresa\.com/i)).toBeVisible();
  });

  test('/backlog sem sessão redireciona pro login', async ({ page }) => {
    await page.goto('/backlog');
    await expect(page).toHaveURL(/\/login/);
  });
});
