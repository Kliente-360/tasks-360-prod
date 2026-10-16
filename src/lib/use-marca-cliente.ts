'use client';

import { useMemo } from 'react';
import { useData } from '@/lib/data-store';

/**
 * Cor do cliente (cadastro: cor_portal + cor_portal_texto) pra pintar o
 * cabeçalho do app quando quem está logado é cliente: ícone, botão
 * + Solicitação e avatar. Staff e cliente sem cor cadastrada → null
 * (fica o verde padrão).
 */
/** Cliente com acesso 'leitura' não abre solicitações (sem botão + nem FAB).
 *  Staff sempre pode. O banco reforça na policy tasks_cliente_insert. */
export function usePodeAbrirSolicitacao(): boolean {
  const { viewerRole, currentPessoa } = useData();
  return viewerRole !== 'cliente' || currentPessoa?.acesso_portal !== 'leitura';
}

export function useMarcaCliente(): { cor: string; texto: string } | null {
  const { viewerRole, currentPessoa, clientes } = useData();
  return useMemo(() => {
    if (viewerRole !== 'cliente') return null;
    const c = clientes.find((x) => x.id === currentPessoa?.cliente_id);
    if (!c?.corPortal) return null;
    return { cor: c.corPortal, texto: c.corPortalTexto === 'dark' ? '#141414' : '#ffffff' };
  }, [viewerRole, currentPessoa?.cliente_id, clientes]);
}
