'use client';

/**
 * StandupCard · primeiro card do Briefing
 *
 * - Default mostra o standup MAIS RECENTE
 * - Nav: [← prev] [hoje] [next →] (estilo calendário · navega entre standups existentes)
 * - Copy: ícone + tooltip flutuante "Copiado!" (1.5s)
 * - Markdown renderizado via `marked`
 *
 * Pré-fetch de todas as datas existentes no mount (lightweight · só a coluna
 * `data`) pra permitir navegação por índice sem query extra a cada click.
 */

import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icons';

interface Standup {
  id: string;
  data: string;            // YYYY-MM-DD
  conteudo_md: string;
  texto_whatsapp: string | null;
  resumo: string | null;
  atualizado_em: string;
}

marked.setOptions({ gfm: true, breaks: true });

function fmtDateLong(iso: string): string {
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

const todayIso = () => new Date().toISOString().slice(0, 10);

export function StandupCard() {
  const sb = useMemo(() => createClient(), []);

  // Lista ordenada DESC de todas as datas existentes (só strings).
  const [dates, setDates] = useState<string[] | null>(null);
  // Data atualmente exibida (null = ainda carregando · usa dates[0] como default).
  const [currentDate, setCurrentDate] = useState<string | null>(null);
  // Conteúdo do standup atual.
  const [standup, setStandup] = useState<Standup | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Mount · prefetch de todas as datas
  useEffect(() => {
    let cancelled = false;
    sb.from('standups')
      .select('data')
      .order('data', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setDates([]);
          setCurrentDate(null);
          setLoading(false);
          return;
        }
        const arr = (data as { data: string }[]).map((r) => r.data);
        setDates(arr);
        setCurrentDate(arr[0]); // mais recente
      });
    return () => { cancelled = true; };
  }, [sb]);

  // Fetch do conteúdo quando currentDate muda
  useEffect(() => {
    if (!currentDate) {
      setStandup(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    sb.from('standups')
      .select('id, data, conteudo_md, texto_whatsapp, resumo, atualizado_em')
      .eq('data', currentDate)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) setStandup(null);
        else setStandup(data as Standup);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sb, currentDate]);

  const html = useMemo(() => {
    if (!standup?.conteudo_md) return '';
    return marked.parse(standup.conteudo_md) as string;
  }, [standup?.conteudo_md]);

  // Navegação
  const currentIdx = dates && currentDate ? dates.indexOf(currentDate) : -1;
  const hasPrev = dates && currentIdx >= 0 && currentIdx < dates.length - 1;
  const hasNext = dates && currentIdx > 0;
  const today = todayIso();
  // "Hoje" desabilita quando já estamos exibindo o standup de hoje
  // (existe E está sendo mostrado).
  const isToday = currentDate === today;

  function goPrev() {
    if (!dates || !hasPrev) return;
    setCurrentDate(dates[currentIdx + 1]);
  }
  function goNext() {
    if (!dates || !hasNext) return;
    setCurrentDate(dates[currentIdx - 1]);
  }
  function goToday() {
    // Se hoje tem standup, vai pra ele. Caso contrário, fica no mais recente.
    if (dates?.includes(today)) setCurrentDate(today);
    else if (dates && dates.length > 0) setCurrentDate(dates[0]);
  }

  function copy() {
    if (!standup) return;
    const text = standup.texto_whatsapp || standup.conteudo_md;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          {/* Nav prev / hoje / next · estilo calendário */}
          <div className="view-toggle" role="group" aria-label="Navegação de standup">
            <button
              type="button"
              onClick={goPrev}
              disabled={!hasPrev}
              title="Standup anterior"
              aria-label="Standup anterior"
            >
              <Icon name="chevron-left" size={15} />
            </button>
            <button
              type="button"
              onClick={goToday}
              disabled={isToday}
              title="Ir pro standup de hoje"
              aria-label="Ir pro standup de hoje"
            >
              hoje
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={!hasNext}
              title="Standup seguinte"
              aria-label="Standup seguinte"
            >
              <Icon name="chevron-right" size={15} />
            </button>
          </div>

          {/* Copy com tooltip flutuante */}
          {standup && (
            <span className="relative inline-flex">
              <button
                type="button"
                onClick={copy}
                className="iconbtn bordered w-8 h-8 inline-flex items-center justify-center"
                title={standup.texto_whatsapp ? 'Copiar versão WhatsApp' : 'Copiar markdown'}
                aria-label="Copiar standup"
              >
                <Icon name="copy" size={14} />
              </button>
              {copied && (
                <span className="copied-bubble" role="status">Copiado!</span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="px-4 py-6 text-sm text-muted">Carregando…</div>
      ) : !standup ? (
        <div className="px-4 py-6 text-sm text-muted">
          {dates && dates.length === 0
            ? 'Nenhum standup publicado ainda.'
            : currentDate
              ? `Sem standup publicado em ${fmtDateLong(currentDate)}.`
              : 'Nenhum standup publicado ainda.'}
        </div>
      ) : (
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
      )}
    </div>
  );
}
