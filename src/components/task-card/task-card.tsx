'use client';

/**
 * `<TaskCard>` — primitiva única de card de task usada em:
 *   - Foco (size=md, checkable)
 *   - Backlog mobile (size=md)
 *   - Kanban coluna (size=sm)
 *   - Dashboard "Precisa de atenção" (size=sm)
 *   - Calendário detail panel (size=lg)
 *
 * Anatomia canônica (md):
 *
 *   ┌────────────────────────────────────────────┐
 *   │ [□]  Título                       [● P0]   │  ← header (opt checkbox)
 *   │      cliente · projeto                     │  ← sub
 *   │      (AV) Nome  [IA]   ontem · 8h          │  ← meta footer
 *   └────────────────────────────────────────────┘
 *
 * Variants:
 *   - size='sm' (kanban): sem nome textual no footer, só avatar + Pri
 *     embaixo em row separada; sem IA chip
 *   - size='md' (default): anatomia completa
 *   - size='lg' (calendário detail): adiciona preview da descrição +
 *     chip de status
 *
 * Variants composicionais:
 *   - checkable: checkbox visual na esquerda (toggle local)
 *   - selected: estado de bulk-select (border verde + tint)
 *   - variant='row': remove border externa (usar em lista contígua)
 */

import { useMemo } from 'react';
import { Icon } from '@/components/icons';
import { PriChip, TaskAvatar, PrazoLabel, TagIA } from './primitives';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  cliente?: string;
  projeto?: string;
  respNome?: string;
  size?: 'sm' | 'md' | 'lg';
  /** card = box com border; row = sem border (lista contígua) */
  variant?: 'card' | 'row';
  /** Mostra checkbox à esquerda (Foco). Não persiste — controlled via `checked`. */
  checkable?: boolean;
  checked?: boolean;
  onToggleCheck?: () => void;
  /** Estado de bulk-select (border verde + tint) */
  selected?: boolean;
  /** Esconde footer com avatar+nome+IA+prazo (raro). */
  hideMeta?: boolean;
  /** Mostra esforco (h) ao lado do prazo no footer (Foco) */
  showEsforco?: boolean;
  /** Pra size=lg: descrição em preview (clamp 2 linhas) */
  descricaoPreview?: string;
  /** Pra size=lg: mostra chip de status no footer */
  showStatus?: boolean;
  onClick?: () => void;
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  andamento: 'Em andamento',
  bloqueado: 'Bloqueado',
  concluido: 'Concluído',
};

export function TaskCard({
  task,
  cliente,
  projeto,
  respNome = '',
  size = 'md',
  variant = 'card',
  checkable = false,
  checked = false,
  onToggleCheck,
  selected = false,
  hideMeta = false,
  showEsforco = false,
  descricaoPreview,
  showStatus = false,
  onClick,
  className,
}: TaskCardProps) {
  const firstName = useMemo(() => respNome.split(/\s+/)[0] ?? '', [respNome]);

  // size=sm tem layout próprio: header + footer (Pri + avatar)
  if (size === 'sm') {
    return (
      <div
        className={cn(
          'tcard sz-sm',
          variant === 'row' && 'is-row',
          selected && 'is-selected',
          checked && 'done',
          className,
        )}
        onClick={onClick}
      >
        <div className="ttl">{task.titulo}</div>
        {(cliente || projeto) && (
          <div className="sub">{cliente}{projeto ? ' · ' + projeto : ''}</div>
        )}
        <div className="sm-footer">
          <PriChip prio={task.prioridade} />
          {respNome && <TaskAvatar name={respNome} title={respNome} />}
        </div>
      </div>
    );
  }

  // size=md ou lg: anatomia compartilhada
  return (
    <div
      className={cn(
        'tcard',
        size === 'lg' && 'sz-lg',
        variant === 'row' && 'is-row',
        selected && 'is-selected',
        checkable && 'check',
        checked && 'done',
        className,
      )}
      onClick={!checkable ? onClick : undefined}
    >
      {checkable && (
        <button
          type="button"
          className="tcard-check"
          onClick={(e) => { e.stopPropagation(); onToggleCheck?.(); }}
          aria-label={checked ? 'Desmarcar' : 'Marcar como feito'}
          aria-pressed={checked}
        >
          {checked && <Icon name="check" size={14} className="text-[color:var(--green)]" />}
        </button>
      )}

      <div className={cn(checkable && 'body')} onClick={checkable ? onClick : undefined}>
        <div className="top">
          <div style={{ minWidth: 0 }}>
            <div className="ttl">{task.titulo}</div>
            {(cliente || projeto) && (
              <div className="sub">{cliente}{projeto ? ' · ' + projeto : ''}</div>
            )}
          </div>
          <PriChip prio={task.prioridade} />
        </div>

        {size === 'lg' && descricaoPreview && (
          <p className="tcard-desc">{descricaoPreview}</p>
        )}

        {!hideMeta && (
          <div className="meta">
            {respNome && <TaskAvatar name={respNome} title={respNome} />}
            {respNome && <span className="text-xs text-muted">{firstName}</span>}
            {task.criadoPorIa && <TagIA />}
            {size === 'lg' && showStatus && (
              <span className={cn('status', `status-${task.status}`)} style={{ fontSize: 10 }}>
                <span className="status-dot" />
                {STATUS_LABEL[task.status] ?? task.status}
              </span>
            )}
            <span className="sp" />
            <PrazoLabel task={task} />
            {showEsforco && task.esforco > 0 && (
              <span className="font-mono text-xs text-muted">· {task.esforco}h</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
