'use client';

/**
 * Réplica do fluxo de login do app Alpine (index.html linhas ~87-177 +
 * lib/app.js signInWithGoogle/sendMagicLink/verifyLoginCode).
 *
 * Dois caminhos:
 *  1. Time interno · Google SSO (signInWithOAuth)
 *  2. Cliente externo · magic link / OTP de 6 dígitos (signInWithOtp + verifyOtp)
 *
 * O check de cadastro/convite (`pessoas` table) é mantido do app atual:
 * só permite enviar OTP se o email existe em `pessoas` com `invited_at`.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_RE = /^\d{6}$/;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  async function signInWithGoogle() {
    if (googleLoading) return;
    setError('');
    setGoogleLoading(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      setError('Erro ao iniciar Google: ' + error.message);
      setGoogleLoading(false);
    }
    // Sucesso: o browser redireciona. Não resetar loading.
  }

  async function sendMagicLink() {
    if (sending) return;
    const normalized = email.trim().toLowerCase();
    setError('');
    if (!EMAIL_RE.test(normalized)) {
      setError('Informe um email válido.');
      return;
    }
    setSending(true);
    try {
      const { data: pessoa, error: pErr } = await supabase
        .from('pessoas')
        .select('id, nome, invited_at')
        .ilike('email', normalized)
        .maybeSingle();
      if (pErr) {
        setError('Erro ao validar acesso: ' + pErr.message);
        return;
      }
      if (!pessoa) {
        setError('Email não está cadastrado. Peça pro admin cadastrar antes.');
        return;
      }
      if (!pessoa.invited_at) {
        setError('Email cadastrado mas sem convite ativo. Peça pro admin clicar em "convidar".');
        return;
      }
      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo },
      });
      if (otpErr) {
        setError(otpErr.message);
        return;
      }
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  async function verifyLoginCode() {
    if (verifying) return;
    const normalized = email.trim().toLowerCase();
    const token = code.trim();
    setError('');
    if (!normalized) {
      setError('Email perdido — recomeça.');
      return;
    }
    if (!CODE_RE.test(token)) {
      setError('Código de 6 dígitos.');
      return;
    }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: normalized, token, type: 'email' });
      if (error) {
        setError(error.message);
        return;
      }
      setCode('');
      router.replace(next);
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  if (sent) {
    return (
      <div>
        <div className="font-brand text-lg font-semibold mb-2">Verifica teu email ✉</div>
        <div className="text-sm text-ink-soft mb-4">
          Mandamos pra <span className="font-mono">{email}</span>:
        </div>

        <div className="text-xs text-muted mb-2">
          <strong className="text-ink">Opção 1 — link no email</strong> (clica e volta pra cá)
        </div>
        <div className="border-t border-line my-3"></div>
        <div className="text-xs text-muted mb-2">
          <strong className="text-ink">Opção 2 — código de 6 dígitos</strong> (use no PWA / outro browser)
        </div>

        <input
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={6}
          className="inp mb-2 font-mono text-center text-xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && verifyLoginCode()}
          placeholder="000000"
        />
        {error && <div className="text-xs text-danger mb-2">{error}</div>}
        <button
          className="btn btn-primary w-full justify-center"
          onClick={verifyLoginCode}
          disabled={verifying || !CODE_RE.test(code)}
        >
          {verifying ? 'verificando…' : 'Entrar com código'}
        </button>

        <button
          className="btn btn-ghost text-xs mt-4"
          onClick={() => {
            setSent(false);
            setCode('');
            setError('');
          }}
        >
          trocar email
        </button>
      </div>
    );
  }

  const emailValid = EMAIL_RE.test(email.trim().toLowerCase());

  return (
    <div>
      <div className="font-brand text-[28px] md:text-[32px] font-semibold mb-8 md:mb-10 text-ink tracking-tight leading-none">
        Entrar
      </div>

      {/* SEÇÃO 1 · Time interno (Google SSO) */}
      <div className="mb-8">
        <button
          className="btn w-full justify-center"
          style={{
            border: '1px solid var(--line-strong)',
            background: 'var(--bg-elev)',
            color: 'var(--ink)',
            height: 48,
            fontSize: 14,
          }}
          onClick={signInWithGoogle}
          disabled={googleLoading || sending}
        >
          {googleLoading ? (
            'redirecionando…'
          ) : (
            <span className="flex items-center gap-2.5">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Acesso Time Interno
            </span>
          )}
        </button>
      </div>

      {/* SEÇÃO 2 · Cliente externo (magic link / OTP) */}
      <div className="border-t border-line pt-8">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted font-mono mb-4">
          Acessar como cliente externo
        </div>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="inp mb-4"
          style={{ height: 48, fontSize: 14 }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyUp={(e) => e.key === 'Enter' && emailValid && sendMagicLink()}
          disabled={sending}
          placeholder="voce@empresa.com"
        />
        {error && <div className="text-xs text-[color:var(--danger)] mb-4">{error}</div>}
        <button
          className="btn btn-primary w-full justify-center"
          style={{ height: 48, fontSize: 14 }}
          onClick={sendMagicLink}
          disabled={sending || !emailValid || googleLoading}
        >
          {sending ? 'enviando…' : 'Receber código por email'}
        </button>
      </div>

      <div className="text-[12px] text-muted mt-10 leading-relaxed">
        Não está cadastrado?{' '}
        <span className="text-[color:var(--green)] font-medium">Peça acesso ao admin do espaço.</span>
      </div>
    </div>
  );
}
