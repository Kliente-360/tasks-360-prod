import { Suspense } from 'react';
import { ResumoClient } from './resumo-client';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-muted text-sm py-8">Carregando…</div>}>
      <ResumoClient />
    </Suspense>
  );
}
