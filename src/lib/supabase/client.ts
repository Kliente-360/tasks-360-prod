/**
 * Cliente Supabase pro browser (Client Components). Usado pra Auth
 * (magic link) e Realtime. Leituras/escritas de dados pesados preferir
 * via Server Components + Drizzle.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
