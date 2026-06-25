'use client';

/**
 * StandupCard · primeiro card do Briefing
 *
 * - Default carrega o standup MAIS RECENTE (GET /get-standups?limit=1)
 * - Date picker permite navegar dias anteriores (GET ?data=YYYY-MM-DD)
 * - Copy to clipboard preferindo `texto_whatsapp`, fallback `conteudo_md`
 * - Markdown renderizado via `marked` (mesmo lib usado em outros lugares)
 *
 * Fonte de verdade: tabela `standups` (RLS staff-only). Lê via
 * supabase-js direto — não passa pelo DataProvider (1 fetch on mount).
 */

import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

interface Standup {
  id: string;
  data: string;            // YYYY-MM-DD
  conteudo_md: string;
  texto_whatsapp: string | null;
  resumo: string | null;
  atualizado_em: string;
}

// Marked com defaults razoáveis pra conteúdo confiável (origem = admin via MCP).
marked.setOptions({ gfm: true, breaks: true });

function fmtDateLong(iso: string): string {
  // "quarta-feira, 25 de junho" — sem ano (mostra o ano só se diferente do atual)
  const d = new Date(iso + 'T12:00:00');
  const thisYear = new Date().getFullYear();
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  if (d.getFullYear() !== thisYear) opts.year = 'numeric';
  return d.toLocaleDateString('pt-BR', opts);
}

export function StandupCard() {
  const sb = useMemo(() => createClient(), []);
  const [standup, setStandup] = useState<Standup | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(''); // '' = mais recente
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    let q = sb
      .from('standups')
      .select('id, data, conteudo_md, texto_whatsapp, resumo, atualizado_em')
      .order('data', { ascending: false })
      .limit(1);

    if (selectedDate) q = q.eq('data', selectedDate);

    q.maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.warn('[standup-card] fetch error', error);
        setStandup(null);
        setNotFound(true);
      } else if (!data) {
        setStandup(null);
        setNotFound(true);
      } else {
        setStandup(data as Standup);
        setNotFound(false);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [sb, selectedDate]);

  const html = useMemo(() => {
    if (!standup?.conteudo_md) return '';
    return marked.parse(standup.conteudo_md) as string;
  }, [standup?.conteudo_md]);

  function copy() {
    if (!standup) return;
    const text = standup.texto_whatsapp || standup.conteudo_md;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {/* silencioso */});
  }

  return (
    <div className="bg-elev border border-line rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-3 md:px-4 py-3 border-b border-line flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="megaphone" size={16} className="text-[var(--brand-dark)]" />
          <h2 className="text-sm font-semibold text-ink">Standup</h2>
          {standup && (
            <span className="text-xs text-muted truncate">
              · {fmtDateLong(standup.data)}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            className="text-xs border border-line rounded px-2 py-1 bg-elev text-ink focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            title="Escolher data"
          />
          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate('')}
              className="text-[11px] text-muted hover:text-ink"
              title="Voltar pra mais recente"
            >
              recente
            </button>
          )}
          {standup && (
            <button
              type="button"
              onClick={copy}
              className={cn(
                'iconbtn bordered text-xs px-2 inline-flex items-center gap-1.5 transition-colors',
                copied && 'text-[var(--brand-dark)] border-[var(--brand)]',
              )}
              title={standup.texto_whatsapp ? 'Copiar versão WhatsApp' : 'Copiar markdown'}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
              {copied ? 'copiado' : 'copiar'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="px-4 py-6 text-sm text-muted">Carregando…</div>
      ) : notFound ? (
        <div className="px-4 py-6 text-sm text-muted">
          {selectedDate
            ? `Sem standup publicado em ${fmtDateLong(selectedDate)}.`
            : 'Nenhum standup publicado ainda.'}
        </div>
      ) : standup ? (
        <div className="px-4 py-4">
          {standup.resumo && (
            <div className="text-sm text-ink font-medium mb-3 pb-3 border-b border-line">
              {standup.resumo}
            </div>
          )}
          <div
            className="standup-md text-sm text-ink"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : null}
    </div>
  );
}
