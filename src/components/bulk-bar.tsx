'use client';

/** Bulk bar — barra fixa de ações em massa (Backlog desktop). */
import { useState } from 'react';
import { useClickAway } from '@/lib/use-click-away';
import { Icon, type IconName } from '@/components/icons';
import { cn } from '@/lib/utils';

// ── BulkSelect · dropdown no padrão .fselect (mesmo visual do FilterBar) ──
interface BulkSelectOption { v: string; label: string; }

/** Select customizado para a bulk bar. Padrão visual idêntico ao FilterBar. */
export function BulkSelect({
  icon,
  label,
  value,
  options,
  onChange,
  disabled,
  allowRemove = true,
  className,
}: {
  icon: IconName;
  label: string;
  value: string;
  options: ReadonlyArray<BulkSelectOption>;
  onChange: (v: string) => void;
  disabled?: boolean;
  allowRemove?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLSpanElement>(() => setOpen(false));
  const isRemove = value === '__none__';
  const cur = options.find((o) => o.v === value);
  const display = isRemove ? '— remover' : (cur?.label ?? label);
  const isActive = !!value && !isRemove;

  return (
    <span className={cn('fs-wrap', className)} ref={ref}>
      <button
        type="button"
        className={cn('fselect', isActive && 'on', disabled && 'is-disabled')}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <Icon name={icon} size={14} className="ic" />
        <span>{display}</span>
        <Icon name="chevron-down" size={14} className="ic" />
      </button>
      {open && !disabled && (
        <div className="fmenu" style={{ minWidth: '160px' }}>
          <button
            type="button"
            className={!value ? 'sel' : ''}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            <span className="grow">{label}</span>
            {!value && <Icon name="check" size={14} />}
          </button>
          {allowRemove && (
            <>
              <div className="fmenu-div" />
              <button
                type="button"
                className={isRemove ? 'sel' : ''}
                onClick={() => { onChange('__none__'); setOpen(false); }}
              >
                <span className="grow" style={{ color: 'var(--ink-soft)' }}>— remover</span>
                {isRemove && <Icon name="check" size={14} />}
              </button>
            </>
          )}
          {options.length > 0 && <div className="fmenu-div" />}
          {options.map((o) => (
            <button
              key={o.v}
              type="button"
              className={value === o.v ? 'sel' : ''}
              onClick={() => { onChange(o.v); setOpen(false); }}
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

// ── BulkBar wrapper ──────────────────────────────────────────────────────────

export function BulkBar({
  selectedCount,
  onClear,
  children,
}: {
  selectedCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  if (selectedCount === 0) return null;
  return (
    <div
      className="bulk-bar fixed z-[55] shadow-xl left-3 right-3 rounded-lg p-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:p-2 md:px-3 md:max-w-[calc(100vw-24px)]"
      style={{
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        background: 'var(--surface-1)',
        border: '1px solid var(--line)',
        borderTop: '3px solid var(--brand)',
      }}
    >
      <div className="flex items-center justify-between md:justify-start gap-2">
        <span className="text-sm md:text-xs font-mono text-muted">
          <strong className="text-ink">{selectedCount}</strong> selecionada
          {selectedCount !== 1 ? 's' : ''}
        </span>
        <div className="hidden md:block w-px h-4 mx-1 bg-line" />
        <button
          type="button"
          className="btn btn-ghost text-xs md:hidden"
          onClick={onClear}
          aria-label="Limpar seleção"
        >
          ✕ limpar
        </button>
      </div>
      <div className="flex flex-col md:flex-row md:items-center gap-2 mt-2 md:mt-0 md:ml-2">
        {children}
      </div>
    </div>
  );
}

export function BulkBarSep() {
  return <div className="hidden md:block w-px h-4 mx-1 bg-line" />;
}

export function BulkBarClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn text-sm md:text-xs py-2 md:py-1.5 px-3 md:px-2 hidden md:inline-flex"
      onClick={onClick}
    >
      limpar
    </button>
  );
}
