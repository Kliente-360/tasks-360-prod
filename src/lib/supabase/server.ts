/**
 * Cliente Supabase pro servidor (Server Components, Route Handlers,
 * Server Actions). Lê/escreve cookies de sessão via @supabase/ssr.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Falha silenciosa quando chamado de um Server Component
          // (não pode setar cookie) — o middleware cuida do refresh.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            /* chamado de Server Component — ok ignorar */
          }
        },
      },
    },
  );
}
