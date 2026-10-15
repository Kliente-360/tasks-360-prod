'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';

/**
 * Nomes de pessoas pro portal (id → nome).
 *
 * Usuário cliente só lê o próprio registro em `pessoas` (RLS), então o
 * nome do responsável vinha vazio. Pra ele, completa com a RPC
 * app_portal_responsaveis (só id + nome de quem cuida das tasks do cliente).
 * Admin/interno já têm todas as pessoas no store.
 */
export function usePortalNomes(clienteId: string): Map<string, string> {
  const { pessoas, viewerRole } = useData();
  const [extras, setExtras] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (viewerRole !== 'cliente' || !clienteId) return;
    let cancelado = false;
    createClient()
      .rpc('app_portal_responsaveis')
      .then(({ data }) => {
        if (cancelado || !data) return;
        const rows = data as { id: string; nome: string }[];
        setExtras(new Map(rows.map((r) => [r.id, r.nome])));
      });
    return () => {
      cancelado = true;
    };
  }, [viewerRole, clienteId]);

  return useMemo(() => {
    const m = new Map(pessoas.map((p) => [p.id, p.nome]));
    extras.forEach((nome, id) => m.set(id, nome));
    return m;
  }, [pessoas, extras]);
}
