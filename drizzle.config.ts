import type { Config } from 'drizzle-kit';

/**
 * Drizzle-kit aponta pro MESMO Postgres do Supabase (app atual).
 * Fluxo recomendado no rebuild:
 *   - `npm run db:pull`  → introspecta o schema real e reconcilia
 *     src/lib/db/schema.ts (mais confiável que manter à mão).
 *   - `npm run db:studio` → inspeciona dados.
 * Migrations novas do rebuild continuam podendo ser coladas no SQL
 * Editor do Dashboard, se preferir manter o workflow atual.
 */
export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Integração Supabase-Vercel injeta POSTGRES_URL; fallback pra DATABASE_URL em dev local.
    url: (process.env.POSTGRES_URL ?? process.env.DATABASE_URL)!,
  },
} satisfies Config;
