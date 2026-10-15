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

/** Seta no canto superior direito que recolhe/expande a seção. */
export function SetaRecolher({
  aberta,
  onClick,
  rotulo,
}: {
  aberta: boolean;
  onClick: () => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="portal-recolher"
      aria-expanded={aberta}
      aria-label={`${aberta ? 'Recolher' : 'Expandir'} ${rotulo}`}
      title={aberta ? 'Recolher' : 'Expandir'}
    >
      <Icon name="chevron-down" size={16} />
    </button>
  );
}
