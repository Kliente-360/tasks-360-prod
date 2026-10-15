'use client';

import { useState } from 'react';
import { Icon } from '@/components/icons';

/** Seção recolhível do portal · sempre abre recolhida (sem memória entre
 *  carregamentos da página). */
export function useSecaoAberta(): [boolean, () => void] {
  const [aberta, setAberta] = useState(false);
  return [aberta, () => setAberta((v) => !v)];
}

/** Cabeçalho recolhível · seta à esquerda do título (padrão do Briefing);
 *  a linha inteira é clicável. */
export function CabecalhoRecolher({
  aberta,
  onClick,
  children,
  className = '',
}: {
  aberta: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`portal-recolher ${className}`}
      aria-expanded={aberta}
    >
      <Icon name="chevron-down" size={14} className="portal-recolher-seta" />
      {children}
    </button>
  );
}
