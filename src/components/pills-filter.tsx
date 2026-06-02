'use client';

/**
 * PillsFilter · filtro segmented com pills. Usado por Foco e Triagem
 * no lugar da FilterBar — abas onde a navegação principal é por
 * grupo/categoria, não por filtros multi-dimensão.
 *
 *   Foco:    [ Minhas (N) ] [ Atrasadas (N) ] [ Hoje (N) ]
 *   Triagem: [ Todos (N) ] [ Cliente respondeu (N) ] [ Criadas por IA (N) ] [ Sem responsável (N) ]
 *
 * Pill ativa = fundo verde-soft + borda verde + texto verde.
 * Contagem em mono à direita do label.
 */

import { Icon, type IconName } from './icons';
import { cn } from '@/lib/utils';

interface PillOption<V extends string = string> {
  v: V;
  label: string;
  icon?: IconName;
  count?: number;
}

interface PillsFilterProps<V extends string> {
  options: ReadonlyArray<PillOption<V>>;
  value: V;
  onChange: (v: V) => void;
}

export function PillsFilter<V extends string>({
  options,
  value,
  onChange,
}: PillsFilterProps<V>) {
  return (
    <div className="pills">
      {options.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            className={cn('pill-f', on && 'on')}
            onClick={() => onChange(o.v)}
          >
            {o.icon && <Icon name={o.icon} size={13} />}
            <span>{o.label}</span>
            {o.count != null && <span className="pf-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
