'use client';

/**
 * Sub-primitivas compartilhadas dos cards de task (A.14).
 *
 * Exporta `<PriChip>`, `<TaskAvatar>` e `<PrazoLabel>` — os três blocos
 * que aparecem juntos em (quase) todo card de task no app. Antes desse
 * módulo, esse padrão estava inlineado em Foco/Backlog mobile/Dashboard
 * "atenção"/Kanban card com pequenas variações. Aqui ficam canônicos.
 *
 * Próximos PRs (sequência A.14):
 *   - `<TaskCard>` em task-card/task-card.tsx (compõe as 3 primitivas)
 *   - `<TaskAlertRow>` em triagem (compõe TaskAvatar + ícone semântico)
 *   - `<DayTaskRibbon>` em calendário (não compõe — design próprio)
 */

import { Icon } from '@/components/icons';
import { atrasada, fmtDateShort } from '@/lib/task-utils';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/types';

// ───────────────────────────────────────────────────────────────────
// PriChip
// ───────────────────────────────────────────────────────────────────

interface PriChipProps {
  /** P0 | P1 | P2 | P3 */
  prio: string;
  /** size visual (default = chip padrão; sm = mais compacto pro Kanban) */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Chip de prioridade · reusa `.pri .pri-P{0..3}` do globals.css.
 * P0/P1 = fundo cheio (alto signal); P2/P3 = fundo muted + border.
 */
export function PriChip({ prio, size = 'md', className }: PriChipProps) {
  return (
    <span
      className={cn('pri', `pri-${prio}`, size === 'sm' && 'pri-sm', className)}
      aria-label={`Prioridade ${prio}`}
    >
      <span className="pri-dot" />
      {prio}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// TaskAvatar
// ───────────────────────────────────────────────────────────────────

interface TaskAvatarProps {
  /** Nome da pessoa — iniciais são derivadas */
  name: string;
  /** 22px (sm) é o tamanho padrão em cards de task. 32px (md) é pro
   *  PageHeader / Cadastros — não usar aqui sem motivo. */
  size?: 'sm' | 'md';
  /** Tooltip extra (default = name) */
  title?: string;
  className?: string;
}

/**
 * Avatar circular de pessoa em cards de task. Sempre circular (quadrado
 * é reservado pra clientes em Cadastros).
 */
export function TaskAvatar({ name, size = 'sm', title, className }: TaskAvatarProps) {
  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';
  const px = size === 'sm' ? 22 : 32;
  const fontSize = size === 'sm' ? 9 : 11;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full font-mono font-semibold',
        className,
      )}
      style={{
        width: px,
        height: px,
        fontSize,
        background: 'var(--green-soft)',
        color: 'var(--green)',
      }}
      title={title ?? name}
      aria-label={name}
    >
      {initials}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// PrazoLabel
// ───────────────────────────────────────────────────────────────────

interface PrazoLabelProps {
  /** Task inteira — pra rodar atrasada() */
  task: Task;
  /** Formato: 'short' (12 jun) ou 'relative' ('ontem', 'há 2h') */
  format?: 'short' | 'relative';
  className?: string;
}

/**
 * Renderiza o prazo de uma task com a cor/peso semântico correto:
 *  - atrasada → vermelho (`--danger`) com texto "Nd atras." ou só a data
 *  - sem prazo → "—" muted
 *  - normal → data curta em mono muted
 *
 * Tasks concluídas nunca aparecem como atrasadas (mesmo se passaram da
 * data) — `atrasada(t)` já cobre essa regra.
 */
export function PrazoLabel({ task, className }: PrazoLabelProps) {
  if (!task.prazo) {
    return <span className={cn('text-xs text-muted', className)}>—</span>;
  }
  const isLate = atrasada(task);
  if (isLate) {
    return (
      <span
        className={cn('font-mono text-xs', className)}
        style={{ color: 'var(--danger)', fontWeight: 600 }}
      >
        {fmtDateShort(task.prazo)}
      </span>
    );
  }
  return (
    <span className={cn('font-mono text-xs text-muted', className)}>
      {fmtDateShort(task.prazo)}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────
// TagIA (mini)
// ───────────────────────────────────────────────────────────────────

/**
 * Chip "IA" — aparece só quando `task.criadoPorIa`. Mantido aqui pra
 * que o footer dos TaskCards reuse a mesma marcação visual.
 */
export function TagIA({ className }: { className?: string }) {
  return (
    <span className={cn('tag-ai', className)} aria-label="Criada por IA">
      <Icon name="bot" size={9} />
      IA
    </span>
  );
}
