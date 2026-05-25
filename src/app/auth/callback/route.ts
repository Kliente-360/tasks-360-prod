/**
 * Callback do Supabase Auth: troca o `?code=` (PKCE) por uma sessão e
 * grava o cookie via @supabase/ssr. Atende tanto o magic link quanto o
 * retorno do Google OAuth.
 *
 * Fluxo: Supabase redireciona pra /auth/callback?code=...&next=/foo
 *   1. exchangeCodeForSession(code) → grava cookies de sessão
 *   2. redirect pra `next` (default /)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';
  const errorDescription = searchParams.get('error_description');

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription)}`,
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login`);
}
