import { Suspense } from 'react';
import { BriefingClient } from './briefing-client';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-muted text-sm py-8">Carregando…</div>}>
      <BriefingClient />
    </Suspense>
  );
}
