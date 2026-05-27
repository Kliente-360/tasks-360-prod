'use client';

/**
 * Hook + utilitário pra "disciplina de comentário diário".
 *
 * useLastCommentByTask — busca o timestamp do último comentário por
 * task_id via uma única query no boot do componente que usa o hook.
 *
 * getBusinessDayCutoff — retorna a meia-noite de ontem (Ter–Sex) ou
 * de sexta passada (Segunda). Retorna null em fim de semana (sem obrigação).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Cutoff de dia útil ──────────────────────────────────────────────────────

/**
 * Retorna o instante (Date) a partir do qual um comentário "conta".
 * - Fim de semana (sáb/dom) → null (sem obrigação)
 * - Segunda-feira          → meia-noite de sexta passada (3 dias atrás)
 * - Terça a Sexta          → meia-noite de ontem
 */
export function getBusinessDayCutoff(): Date | null {
  const now = new Date();
  const dow = now.getDay(); // 0=dom, 6=sab
  if (dow === 0 || dow === 6) return null;
  const daysBack = dow === 1 ? 3 : 1;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Busca o timestamp do último comentário para cada task_id da lista.
 * O Map resultante contém apenas tasks que TÊM pelo menos 1 comentário.
 * Tasks ausentes no Map = sem comentário algum.
 *
 * Dispara apenas uma query no mount (e quando taskIds mudar de forma
 * relevante). Não faz polling — dados suficientes pra rotina diária.
 */
export function useLastCommentByTask(taskIds: string[]): {
  lastCommentMap: Map<string, Date>;
  loading: boolean;
} {
  const [lastCommentMap, setLastCommentMap] = useState<Map<string, Date>>(new Map());
  const [loading, setLoading] = useState(false);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // Key estável derivada dos IDs — evita re-query a cada render.
  const key = useMemo(() => taskIds.slice().sort().join(','), [taskIds]);

  useEffect(() => {
    if (!key) {
      setLastCommentMap(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ids = key.split(',').filter(Boolean);
      const { data } = await sb
        .from('task_comments')
        .select('task_id, criado_em')
        .in('task_id', ids);
      if (cancelled) return;
      const map = new Map<string, Date>();
      for (const row of (data ?? []) as { task_id: string; criado_em: string }[]) {
        const d = new Date(row.criado_em);
        const prev = map.get(row.task_id);
        if (!prev || d > prev) map.set(row.task_id, d);
      }
      setLastCommentMap(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [key, sb]);

  return { lastCommentMap, loading };
}

// ─── Formatação ──────────────────────────────────────────────────────────────

/** "sem comentário" | "hoje" | "ontem" | "Nd atrás" */
export function fmtLastComment(d: Date | undefined): string {
  if (!d) return 'sem comentário';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `${days}d atrás`;
}
