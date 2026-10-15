/**
 * Confirma o link dos e-mails de acesso (primeiro acesso, login e convite).
 *
 * Os templates apontam pra /auth/confirm?token_hash=...&type=...&next=...
 * e a verificação acontece aqui no servidor (verifyOtp com token_hash).
 * Diferente do fluxo PKCE do /auth/callback, não depende do navegador
 * que pediu o link: funciona quando o convite sai do navegador do admin
 * e o cliente abre o e-mail em outro computador ou no celular.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const TIPOS: EmailOtpType[] = ['email', 'signup', 'invite', 'magiclink', 'recovery', 'email_change'];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const nextRaw = searchParams.get('next') || '/';
  // Só caminhos internos (evita redirecionar pra fora do app)
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  if (tokenHash && type && TIPOS.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Este link expirou ou já foi usado. Peça um novo código abaixo.')}`,
    );
  }

  return NextResponse.redirect(`${origin}/login`);
}
