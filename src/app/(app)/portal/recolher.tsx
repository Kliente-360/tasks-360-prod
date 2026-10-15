'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

/** Seção recolhível do portal · lembra o estado no navegador. */
export function useSecaoAberta(chave: string, padrao = true): [boolean, () => void] {
  const lsKey = `kliente360-portal-secao-${chave}`;
  const [aberta, setAberta] = useState(padrao);
  useEffect(() => {
    try {
      const v = localStorage.getItem(lsKey);
      if (v === '0' || v === '1') setAberta(v === '1');
    } catch {
      /* noop */
    }
  }, [lsKey]);
  const alternar = () => {
    setAberta((cur) => {
      const next = !cur;
      try {
        localStorage.setItem(lsKey, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  };
  return [aberta, alternar];
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
