import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar · tasks 360',
};

// Shell Server Component. Toda a interação (envio de magic link, verify OTP,
// Google OAuth) fica no LoginForm Client Component.
export default function LoginPage() {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-elev p-4">
      <div className="card max-w-sm w-full p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="k360-mark">
            <span></span><span></span><span></span><span></span>
          </div>
          <div className="leading-none">
            <div className="font-brand text-[22px] font-semibold text-brand">tasks 360</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted mt-1.5 font-mono">por Kliente 360</div>
          </div>
        </div>
        <Suspense fallback={<div className="text-sm text-muted">Carregando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
