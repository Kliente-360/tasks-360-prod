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
import { CabecalhoRecolher, useSecaoAberta } from './recolher';

type Tipo = 'entregas' | 'riscos';

interface Insight {
  tipo: Tipo;
  periodo: string;
  conteudo_md: string;
  gerado_em: string;
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

  const [aberta, alternar] = useSecaoAberta('visao-qualitativa');
  return (
    <section className="card p-4 md:p-5">
      <CabecalhoRecolher aberta={aberta} onClick={alternar}>
        <span className="font-brand text-sm font-semibold text-ink">Visão qualitativa</span>
      </CabecalhoRecolher>
      {aberta && (
    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
      <IaBox
        titulo="Entregas de valor no mês anterior"
        vazio="O resumo do mês sai no primeiro dia de cada mês."
        insight={dados.entregas}
      />
      <IaBox
        titulo="Riscos no backlog atual"
        vazio="A análise de riscos é atualizada todos os dias."
        insight={dados.riscos}
      />
    </div>
      )}
    </section>
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
    <div className="portal-ia-box">
      <h3 className="text-[13px] font-semibold text-ink m-0 mb-2">{titulo}</h3>
      {insight === undefined ? (
        <div className="text-xs text-muted italic">Carregando…</div>
      ) : insight === null ? (
        <div className="text-xs text-muted italic">{vazio}</div>
      ) : (
        <div className="portal-ia-md" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
