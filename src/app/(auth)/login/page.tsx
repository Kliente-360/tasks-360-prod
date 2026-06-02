import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar · tasks 360',
};

/**
 * Login · split-screen no desktop (≥900px) · form único no mobile.
 *
 * Layout (ref: docs/design_handoff_tasks360_mobile_login/README.md §4):
 *   [ painel marca escuro · aperture marca d'água ]  [ formulário ]
 *
 * Mobile: o painel some, o form herda a marca (aperture + tasks 360)
 * sem o subtítulo "por Kliente 360".
 */
export default function LoginPage() {
  return (
    <div className="login-split">
      {/* ============ Painel de marca · ≥900px ============ */}
      <aside className="login-brand">
        {/* aperture marca d'água gigante no canto inferior direito */}
        <span className="mark login-brand-wm" aria-hidden>
          <span /><span /><span /><span />
        </span>

        <div className="login-brand-top">
          <span className="mark sz-28" aria-hidden>
            <span /><span /><span /><span />
          </span>
          <b>tasks 360</b>
        </div>

        <div className="login-brand-body">
          <div className="login-brand-eyebrow">Acesso · time &amp; clientes</div>
          <h1 className="login-brand-headline">
            Conhecimento aplicado, <em>como serviço.</em>
          </h1>
          <p className="login-brand-lead">
            Gestão do time, dos prazos e dos clientes em um só lugar.
          </p>
        </div>

        <div className="login-brand-foot">por Kliente 360 · {new Date().getFullYear()}</div>
      </aside>

      {/* ============ Formulário ============ */}
      <main className="login-form-wrap">
        <div className="login-form-inner">
          {/* Marca inline · só aparece <900px */}
          <div className="login-form-mark">
            <span className="mark sz-28" aria-hidden>
              <span /><span /><span /><span />
            </span>
            <b>tasks 360</b>
          </div>

          <Suspense fallback={<div className="text-sm text-muted">Carregando…</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
