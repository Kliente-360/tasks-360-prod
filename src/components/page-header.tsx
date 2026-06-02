'use client';

/**
 * PageHeader · header interno padrão de cada tela autenticada (uma linha).
 *
 * Anatomia: [título + contexto · aside opcional] ........ [right slot]
 *
 *   - title: h1 grande
 *   - context: subtítulo curto com métrica rápida (números em <b>)
 *   - titleAside: slot opcional AO LADO do título (setas do Calendário,
 *     toggle Macro/Op do Kanban)
 *   - right: slot opcional à direita — geralmente FilterBar ou PillsFilter
 *
 * SEM botão de ação primária aqui. Criar tarefa / Exportar etc vivem
 * no header global (app-nav).
 */

import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  /** Subtítulo / métrica rápida. Pode conter JSX com <b> nos números. */
  context?: ReactNode;
  /** Slot ao lado do título — setas, toggle de modo, etc. */
  titleAside?: ReactNode;
  /** Slot à direita — FilterBar, PillsFilter, ações secundárias. */
  right?: ReactNode;
}

export function PageHeader({ title, context, titleAside, right }: PageHeaderProps) {
  return (
    <div className="pageheader">
      <div className="ph-left">
        <div className="ph-titles">
          <h1>{title}</h1>
          {context && <div className="narr">{context}</div>}
        </div>
        {titleAside}
      </div>
      {right && <div className="ph-right">{right}</div>}
    </div>
  );
}
