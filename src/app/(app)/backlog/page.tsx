import { Suspense } from 'react';
import { BacklogClient } from './backlog-client';

export default function Page() {
  // BacklogClient usa useSearchParams (filtros via URL do palette).
  // Next exige Suspense pra prerender — fallback mínimo evita CLS.
  return (
    <Suspense fallback={<div className="text-muted text-sm">Carregando…</div>}>
      <BacklogClient />
    </Suspense>
  );
}
