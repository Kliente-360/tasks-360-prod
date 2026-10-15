'use client';

/**
 * Caixas de IA do portal · "Entregas de valor no mês anterior" e
 * "Riscos no backlog atual". Textos gerados pelas rotinas agendadas
 * (docs/portal-insights) e lidos de `portal_insights` (mais recente de
 * cada tipo; RLS: cliente só lê os próprios).
 */

import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';

type Tipo = 'entregas' | 'riscos';

interface Insight {
  tipo: Tipo;
  periodo: string;
  conteudo_md: string;
  gerado_em: string;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function rotuloPeriodo(i: Insight): string {
  if (i.tipo === 'entregas') {
    const [y, m] = i.periodo.split('-');
    return `${MESES[Number(m) - 1] ?? m} de ${y}`;
  }
  const [, m, d] = i.periodo.split('-');
  return `semana de ${d}/${m}`;
}

/** O texto vem de IA lendo o que o cliente escreve: HTML é escapado antes
 *  do markdown (o formato só usa parágrafo, lista e negrito). */
function renderSeguro(md: string): string {
  const escapado = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return marked.parse(escapado, { gfm: true, breaks: false, async: false }) as string;
}

export function PortalIaBoxes({ clienteId }: { clienteId: string }) {
  const [dados, setDados] = useState<Partial<Record<Tipo, Insight | null>>>({});

  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setDados({});
    const sb = createClient();
    (['entregas', 'riscos'] as Tipo[]).forEach((tipo) => {
      sb.from('portal_insights')
        .select('tipo, periodo, conteudo_md, gerado_em')
        .eq('cliente_id', clienteId)
        .eq('tipo', tipo)
        .order('periodo', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelado) setDados((cur) => ({ ...cur, [tipo]: (data as Insight | null) ?? null }));
        });
    });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <IaBox
        titulo="Entregas de valor no mês anterior"
        vazio="O resumo do mês sai no primeiro dia de cada mês."
        insight={dados.entregas}
      />
      <IaBox
        titulo="Riscos no backlog atual"
        vazio="A análise de riscos é atualizada toda segunda-feira."
        insight={dados.riscos}
      />
    </div>
  );
}

function IaBox({
  titulo,
  vazio,
  insight,
}: {
  titulo: string;
  vazio: string;
  insight: Insight | null | undefined;
}) {
  const html = useMemo(() => (insight ? renderSeguro(insight.conteudo_md) : ''), [insight]);
  return (
    <section className="card p-4 md:p-5 portal-ia-box">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h2 className="font-brand text-sm font-semibold text-ink m-0">{titulo}</h2>
        {insight && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted shrink-0">
            {rotuloPeriodo(insight)}
          </span>
        )}
      </div>
      {insight === undefined ? (
        <div className="text-xs text-muted italic">Carregando…</div>
      ) : insight === null ? (
        <div className="text-xs text-muted italic">{vazio}</div>
      ) : (
        <>
          <div className="portal-ia-md" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="mt-3 text-[10px] font-mono text-muted">
            gerado em {new Date(insight.gerado_em).toLocaleDateString('pt-BR')} · texto escrito por IA a partir das tarefas
          </div>
        </>
      )}
    </section>
  );
}
