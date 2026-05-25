/**
 * Cliente Drizzle (server-side apenas). Conecta no mesmo Postgres do
 * Supabase via DATABASE_URL. NUNCA importar isto em código de client.
 *
 * `prepare: false` é necessário pro pooler em modo transaction do
 * Supabase (porta 6543).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString =
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  'postgres://placeholder:placeholder@localhost:5432/placeholder';

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
