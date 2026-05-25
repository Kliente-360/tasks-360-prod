import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — Onda 0 · 4.J
 *
 * Foco: helpers puros (sem DOM, sem network). Roda em ms.
 * Resolve `@/` igual ao tsconfig pra os imports baterem.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
});
