'use client';

/**
 * FilterBar · componente único de filtros, reutilizável em Backlog,
 * Kanban, Calendário, Dashboard e Timesheet.
 *
 * Gramática fixa, sempre nesta ordem:
 *   [ Buscar ] [ Cliente ] [ Projeto ] [ Resp ] [ Prazo ] [ Limpar(n) ] [ ⋯ ]
 *
 * Cada tela passa só os filtros que faz sentido via `show`, mas todas
 * usam o MESMO componente. ⋯ vem com itens contextuais (passados via
 * `moreItems`) — Backlog tem todas as opções; outras telas têm algumas
 * desabilitadas.
 *
 * Estado vive em `useFilters()` por tela; predicado padronizado em
 * `matchFilters` (lib/filters.ts).
 */

import { useState } from 'react';
import { Icon } from './icons';
import { useClickAway } from '@/lib/use-click-away';
import {
  countActive,
  PRAZO_OPTIONS,
  type Filters,
} from '@/lib/filters';
import { cn } from '@/lib/utils';

// ============ tipos compartilhados ============

export type FilterKey = 'cliente' | 'projeto' | 'resp' | 'prazo';

interface Option {
  v: string;
  label: string;
}

export interface MoreMenuItem {
  /** Identificador único pro key */
  key: string;
  /** Label exibido */
  label: string;
  /** 'toggle' mostra um mini-switch; 'action' executa onClick e fecha */
  kind?: 'toggle' | 'action';
  /** Pra toggle: se está ligado. Pra action: realça (raro) */
  active?: boolean;
  /** Quando false aparece desabilitado/acinzentado, não some */
  enabled?: boolean;
  /** Ícone Lucide (action only) */
  icon?: Parameters<typeof Icon>[0]['name'];
  /** Hint opcional (atalho de teclado, contagem) */
  hint?: string;
  onClick?: () => void;
}

// ============ FilterSelect (popover) ============

interface FilterSelectProps {
  icon?: Parameters<typeof Icon>[0]['name'];
  label: string;
  value: string;
  options: ReadonlyArray<Option>;
  onChange: (v: string) => void;
}

function FilterSelect({ icon, label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(() => setOpen(false));
  const cur = options.find((o) => o.v === value);
  return (
    <span className="fs-wrap" ref={ref}>
      <button
        type="button"
        className={cn('fselect', value && 'on')}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <Icon name={icon} size={14} className="ic" />}
        <span>{value ? cur?.label ?? label : label}</span>
        <Icon name="chevron-down" size={14} className="ic" />
      </button>
      {open && (
        <div className="fmenu">
          <button
            type="button"
            className={!value ? 'sel' : ''}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            <span className="grow">Todos</span>
            {!value && <Icon name="check" size={14} />}
          </button>
          <div className="fmenu-div" />
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              className={value === o.v ? 'sel' : ''}
              onClick={() => {
                onChange(o.v);
                setOpen(false);
              }}
            >
              <span className="grow">{o.label}</span>
              {value === o.v && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ============ MoreMenu (⋯) ============

interface MoreMenuProps {
  items: MoreMenuItem[];
}

export function MoreMenu({ items }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(() => setOpen(false));
  return (
    <span className="fs-wrap" ref={ref}>
      <button
        type="button"
        className="iconbtn bordered"
        onClick={() => setOpen((o) => !o)}
        title="Mais opções"
        aria-label="Mais opções"
      >
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="fmenu more">
          {items.map((it) =>
            it.label === '---' ? (
              <div key={it.key} className="fmenu-div" />
            ) : (
              <button
                key={it.key}
                type="button"
                className={cn(
                  'more-item',
                  it.active && 'active',
                  it.enabled === false && 'disabled',
                )}
                disabled={it.enabled === false}
                onClick={() => {
                  if (it.enabled === false) return;
                  it.onClick?.();
                  if (it.kind !== 'toggle') setOpen(false);
                }}
              >
                {it.kind === 'toggle' ? (
                  <span className={cn('mini-toggle', it.active && 'on')} />
                ) : it.icon ? (
                  <Icon name={it.icon} size={14} />
                ) : (
                  <span className="mini-spacer" />
                )}
                <span className="grow">{it.label}</span>
                {it.hint && <span className="more-hint">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </span>
  );
}

// ============ FilterBar (principal) ============

interface FilterBarProps {
  /** Quais filtros aparecem (em ordem fixa). Default: todos os 4. */
  show?: FilterKey[];
  /** Estado de filtros */
  f: Filters;
  /** Setter genérico (recebe key + value) */
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  /** Zera todos os filtros */
  onClear: () => void;
  /** Opções pros selects, derivadas dos dados da tela */
  clienteOptions?: ReadonlyArray<Option>;
  projetoOptions?: ReadonlyArray<Option>;
  pessoaOptions?: ReadonlyArray<Option>;
  /** Itens do ⋯ — passe undefined pra omitir o menu. */
  moreItems?: MoreMenuItem[];
  /** Placeholder do campo busca */
  searchPlaceholder?: string;
  /** Desabilita o input de busca mas mantém visível (Dashboard agrega
   *  dados — busca textual não faz sentido lá, mas a bar continua
   *  com a mesma anatomia de qualquer outra tela). */
  disableSearch?: boolean;
  /** Slot opcional à esquerda do campo de busca — usado por Kanban (toggle
   *  Operacional/Executiva) e Calendário (setas de mês). Mantém o
   *  espaçamento padrão da bar. */
  leftSlot?: React.ReactNode;
}

const DEFAULT_SHOW: FilterKey[] = ['cliente', 'projeto', 'resp', 'prazo'];

export function FilterBar({
  show = DEFAULT_SHOW,
  f,
  set,
  onClear,
  clienteOptions = [],
  projetoOptions = [],
  pessoaOptions = [],
  moreItems,
  searchPlaceholder = 'Buscar',
  disableSearch = false,
  leftSlot,
}: FilterBarProps) {
  const active = countActive(f);
  return (
    <div className="filterbar inline">
      {leftSlot}
      <label className={cn('search', disableSearch && 'is-disabled')}>
        <Icon name="search" size={14} className="ic" />
        <input
          type="text"
          value={f.q}
          placeholder={searchPlaceholder}
          onChange={(e) => set('q', e.target.value)}
          disabled={disableSearch}
          title={disableSearch ? 'Busca textual não se aplica a esta tela' : undefined}
        />
      </label>

      {show.includes('cliente') && (
        <FilterSelect
          icon="building"
          label="Cliente"
          value={f.cliente}
          options={clienteOptions}
          onChange={(v) => set('cliente', v)}
        />
      )}
      {show.includes('projeto') && (
        <FilterSelect
          icon="folder"
          label="Projeto"
          value={f.projeto}
          options={projetoOptions}
          onChange={(v) => set('projeto', v)}
        />
      )}
      {show.includes('resp') && (
        <FilterSelect
          icon="users"
          label="Responsável"
          value={f.resp}
          options={pessoaOptions}
          onChange={(v) => set('resp', v)}
        />
      )}
      {show.includes('prazo') && (
        <FilterSelect
          icon="calendar"
          label="Prazo"
          value={f.prazo}
          options={PRAZO_OPTIONS}
          onChange={(v) => set('prazo', v as Filters['prazo'])}
        />
      )}

      {/* Ordem dos utilitários: ⋯ (MoreMenu) → X (Limpar). O X fica
          ENCOSTADO à direita seguindo o padrão dos demais botões da
          header-bar (ações destrutivas/finais sempre na ponta). */}
      {moreItems && <MoreMenu items={moreItems} />}

      <button
        type="button"
        className={cn('fselect clear', active === 0 && 'is-empty')}
        onClick={active > 0 ? onClear : undefined}
        disabled={active === 0}
        title={active > 0 ? `Limpar ${active} filtro${active > 1 ? 's' : ''}` : 'Nenhum filtro aplicado'}
        aria-label={active > 0 ? `Limpar ${active} filtros` : 'Sem filtros'}
      >
        <Icon name="x" size={14} className="ic" />
        <span
          className="font-mono"
          style={{ visibility: active > 0 ? 'visible' : 'hidden' }}
          aria-hidden={active === 0}
        >
          {active > 0 ? active : 0}
        </span>
      </button>
    </div>
  );
}
