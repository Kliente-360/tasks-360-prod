'use client';

/**
 * Hook · timestamp do último comentário por task_id, opcionalmente
 * filtrado por author_pessoa_id. Usado pelo Foco pra detectar tasks
 * sem comment recente do dono.
 *
 * Busca em uma única query no mount; sem polling. Expõe
 * `markCommented(taskId)` pra optimistic update após o usuário postar
 * um comment — sem isso, a task continuaria aparecendo na seção
 * "Sem comentário" até o próximo reload.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useLastCommentByTask(
  taskIds: string[],
  /** Se passado, filtra só comments com esse author_pessoa_id. */
  authorPessoaId?: string | null,
): {
  lastCommentMap: Map<string, Date>;
  loading: boolean;
  markCommented: (taskId: string, when?: Date) => void;
} {
  const [lastCommentMap, setLastCommentMap] = useState<Map<string, Date>>(new Map());
  const [loading, setLoading] = useState(false);

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  // Key estável derivada dos IDs + autor — evita re-query a cada render.
  const key = useMemo(
    () => taskIds.slice().sort().join(',') + '|' + (authorPessoaId || ''),
    [taskIds, authorPessoaId],
  );

  useEffect(() => {
    const ids = key.split('|')[0].split(',').filter(Boolean);
    const author = key.split('|')[1] || null;
    if (!ids.length) {
      setLastCommentMap(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      let q = sb
        .from('task_comments')
        .select('task_id, criado_em, author_pessoa_id')
        .in('task_id', ids);
      if (author) q = q.eq('author_pessoa_id', author);
      const { data } = await q;
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

  /** Optimistic update — usado quando o caller acabou de inserir
   *  um comment e quer refletir imediatamente sem refetch. */
  const markCommented = useCallback((taskId: string, when: Date = new Date()) => {
    setLastCommentMap((prev) => {
      const next = new Map(prev);
      next.set(taskId, when);
      return next;
    });
  }, []);

  return { lastCommentMap, loading, markCommented };
}
