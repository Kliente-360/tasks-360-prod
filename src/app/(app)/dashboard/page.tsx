import { Suspense } from 'react';
import { DashboardClient } from './dashboard-client';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-muted text-sm py-8">Carregando…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
