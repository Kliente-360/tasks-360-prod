'use client';

/**
 * FilterSheet · v1.03 mobile shell
 *
 * Bottom sheet com os mesmos 4 filtros do FilterBar desktop:
 *   - Cliente · Responsável · Prioridade · Prazo
 *
 * Genérico: o consumer passa filtros + setter; cada linha cicla por opts.
 * Fecha em: tap fora · Escape · botão Aplicar/Limpar.
 *
 * Usado pelo backlog mobile. Outras telas podem reusar passando outras opts.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

export type MobileFilters = {
  cliente: string;
  resp: string;
  pri: string;
  prazo: string; // '' | 'atrasadas'
};

const EMPTY: MobileFilters = { cliente: '', resp: '', pri: '', prazo: '' };

export function FilterSheet({
  filters,
  setFilters,
  onClose,
  clientes,
  pessoas,
}: {
  filters: MobileFilters;
  setFilters: (f: MobileFilters) => void;
  onClose: () => void;
  clientes: ReadonlyArray<string>;
  pessoas: ReadonlyArray<string>;
}) {
  const [draft, setDraft] = useState<MobileFilters>(filters);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const cycle = (key: keyof MobileFilters, opts: ReadonlyArray<string>) => () => {
    const i = opts.indexOf(draft[key]);
    const next = opts[(i + 1) % opts.length];
    setDraft({ ...draft, [key]: next });
  };

  const clienteOpts = ['', ...clientes];
  const respOpts = ['', ...pessoas];
  const priOpts = ['', 'P0', 'P1', 'P2', 'P3'];
  const prazoOpts = ['', 'atrasadas'];

  const label = (v: string, none: string) =>
    !v ? none : v === 'atrasadas' ? 'Atrasadas' : v;

  return (
    <div className="sheet-bg" onClick={onClose} role="dialog" aria-modal="true" aria-label="Filtros">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Filtros</h2>
        <div className="sh-sub">aplicam à lista do backlog</div>
        <div className="m-group">
          <button type="button" className="m-row" onClick={cycle('cliente', clienteOpts)}>
            <span className="ric"><Icon name="building" size={16} /></span>
            <div className="rbody"><div className="rt">Cliente</div></div>
            <span className="val">{label(draft.cliente, 'Todos')}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('resp', respOpts)}>
            <span className="ric"><Icon name="users" size={16} /></span>
            <div className="rbody"><div className="rt">Responsável</div></div>
            <span className="val">{draft.resp ? draft.resp.split(' ')[0] : 'Todos'}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('pri', priOpts)}>
            <span className="ric"><Icon name="alert" size={16} /></span>
            <div className="rbody"><div className="rt">Prioridade</div></div>
            <span className="val">{label(draft.pri, 'Todas')}</span>
          </button>
          <button type="button" className="m-row" onClick={cycle('prazo', prazoOpts)}>
            <span className="ric"><Icon name="calendar" size={16} /></span>
            <div className="rbody"><div className="rt">Prazo</div></div>
            <span className="val">{label(draft.prazo, 'Qualquer')}</span>
          </button>
        </div>
        <div className="filter-actions">
          <button
            type="button"
            className="btn"
            onClick={() => { setFilters(EMPTY); onClose(); }}
          >
            Limpar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setFilters(draft); onClose(); }}
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

export const EMPTY_MOBILE_FILTERS = EMPTY;
