'use client';

/**
 * MobileTaskCard · v1.03 mobile shell
 *
 * Card de tarefa no padrão mobile (.tcard). Reutilizado nas 5 telas
 * (Backlog, Foco, Dashboard "precisa de atenção", Portal, Briefing).
 *
 * Espelha o markup de `mobile.jsx` (TaskCard). Avatar com iniciais,
 * chip de prioridade reusa o DS (.pri pri-Pn), prazo vermelho quando
 * atrasada, chip "IA" quando criadoPorIa.
 */

import { atrasada, diasAtraso, fmtDateShort } from '@/lib/task-utils';
import { Icon } from '@/components/icons';
import type { Task } from '@/lib/types';

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).slice(0, 2);
  return parts.map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

export function MobileAvatar({ nome, sm }: { nome: string; sm?: boolean }) {
  const size = sm ? 22 : 28;
  return (
    <span
      className="mavatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--green-soft)',
        color: 'var(--green)',
        fontFamily: 'var(--mono)',
        fontWeight: 600,
        fontSize: sm ? 10 : 12,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
      aria-hidden="true"
    >
      {initials(nome)}
    </span>
  );
}

type Props = {
  task: Task;
  clienteNome: string;
  projetoNome: string;
  pessoaNome: string;
  onOpen: (id: string) => void;
};

export function MobileTaskCard({ task, clienteNome, projetoNome, pessoaNome, onOpen }: Props) {
  const late = atrasada(task);
  const firstName = (pessoaNome || '—').split(/\s+/)[0];
  const prazoLabel = task.prazo
    ? (late ? `${diasAtraso(task)}d atrasada` : fmtDateShort(task.prazo))
    : 'sem prazo';
  return (
    <div className="tcard" onClick={() => onOpen(task.id)}>
      <div className="top">
        <div style={{ minWidth: 0 }}>
          <div className="ttl">{task.titulo}</div>
          <div className="sub">
            {clienteNome || '—'}
            {projetoNome ? ' · ' + projetoNome : ''}
          </div>
        </div>
        {task.prioridade && (
          <span className={`pri shrink-0 pri-${task.prioridade}`}>
            <span className="pri-dot" />
            {task.prioridade}
          </span>
        )}
      </div>
      <div className="meta">
        <MobileAvatar nome={pessoaNome || '—'} sm />
        <span className="fs12 muted">{firstName}</span>
        <span className="sp" />
        {task.criadoPorIa && (
          <span className="tag-ai">
            <Icon name="tag-ai" size={9} />
            IA
          </span>
        )}
        {late ? (
          <span className="late">{prazoLabel}</span>
        ) : (
          <span className="mono fs12 muted">{prazoLabel}</span>
        )}
      </div>
    </div>
  );
}
