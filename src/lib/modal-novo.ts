'use client';

/**
 * Chave do modal novo da tarefa (beta · nov/2026). Por pessoa e por
 * navegador: qualquer pessoa do time liga no menu do perfil; quem não ligar
 * segue no modal atual até a liberação geral.
 */

import { useEffect, useState } from 'react';

const CHAVE = 'k360-modal-novo';
const EVENTO = 'k360-modal-novo';

export function lerModalNovo(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1';
  } catch {
    return false;
  }
}

export function definirModalNovo(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE, ligado ? '1' : '0');
  } catch {
    /* sem storage: fica desligado */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function useModalNovo(): boolean {
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    const atualizar = () => setLigado(lerModalNovo());
    atualizar();
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(EVENTO, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);
  return ligado;
}
