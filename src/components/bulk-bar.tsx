'use client';

/**
 * Bulk bar — barra fixa de ações em massa.
 * Layout padronizado entre Backlog e Triagem; cada tela controla os
 * campos via children. Visual: fundo --surface-1 + borda topo verde,
 * mesma estrutura mobile-stack / desktop-inline.
 *
 * Estrutura no children: selects/inputs primeiro, depois os botões
 * `.btn` (primary/ghost/danger) — eles mantêm contraste nativo sem
 * lutar com fundo escuro.
 */
import React from 'react';

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

/** Separador vertical entre grupos de controles (campos vs ações).
 *  Renderiza só no desktop pra não desperdiçar linha no mobile. */
export function BulkBarSep() {
  return <div className="hidden md:block w-px h-4 mx-1 bg-line" />;
}

/** Botão "limpar" do desktop — fica colado nos botões de ação.
 *  Usa .btn padrão (não .btn-ghost) pra ter border + bg nativos que
 *  funcionam tanto em light quanto dark mode sem precisar de override. */
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
