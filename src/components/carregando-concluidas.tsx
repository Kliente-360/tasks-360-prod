'use client';

/** Aviso enquanto "Todas as concluídas" busca o histórico no banco. */

import { useData } from '@/lib/data-store';

export function CarregandoConcluidas() {
  const { carregandoConcluidas } = useData();
  if (!carregandoConcluidas) return null;
  return (
    <div className="carregando-concluidas" role="status" aria-live="polite">
      <span className="carregando-concluidas-ponto" aria-hidden="true" />
      Carregando concluídas antigas…
    </div>
  );
}
