'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTimer, fmtElapsed } from '@/lib/use-timer';
import { useData, useClientesById } from '@/lib/data-store';
import { cn } from '@/lib/utils';

function TaskPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (taskId: string) => void;
  onClose: () => void;
}) {
  const { tasks, currentPessoa } = useData();
  const clientesById = useClientesById();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const myId = currentPessoa?.id;
    return tasks
      .filter((t) => !t.arquivadoEm && t.status === 'andamento')
      .sort((a, b) => {
        // My tasks first
        const aMine = a.pessoaId === myId ? 0 : 1;
        const bMine = b.pessoaId === myId ? 0 : 1;
        return aMine - bMine || a.titulo.localeCompare(b.titulo);
      });
  }, [tasks, currentPessoa?.id]);

  const filtered = q.trim()
    ? candidates.filter(
        (t) =>
          t.titulo.toLowerCase().includes(q.toLowerCase()) ||
          (clientesById.get(t.clienteId)?.nome ?? '').toLowerCase().includes(q.toLowerCase()),
      )
    : candidates;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center modal-bg pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-md p-4" role="dialog" aria-label="Selecionar tarefa">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-[var(--brand)] shrink-0" />
          <span className="text-sm font-medium">Iniciar cronômetro</span>
          <button type="button" className="icon-btn text-muted ml-auto" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <input
          ref={inputRef}
          type="text"
          className="inp mb-3"
          placeholder="Buscar tarefa em andamento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {candidates.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhuma tarefa em andamento atribuída a você.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhum resultado.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-line">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-2.5 hover:bg-[var(--surface-3)] transition-colors rounded"
                  onClick={() => onSelect(t.id)}
                >
                  <div className="text-sm font-medium text-ink truncate">{t.titulo}</div>
                  <div className="text-xs text-muted">{clientesById.get(t.clienteId)?.nome ?? ''}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function TimerButton() {
  const { activeEntry, elapsed, starting, stopping, startTimer, stopTimer } = useTimer();
  const { tasks } = useData();
  const [picking, setPicking] = useState(false);

  const activeTask = activeEntry ? tasks.find((t) => t.id === activeEntry.taskId) : null;

  async function handleSelect(taskId: string) {
    setPicking(false);
    await startTimer(taskId);
  }

  if (activeEntry) {
    return (
      <button
        type="button"
        onClick={stopTimer}
        disabled={stopping}
        title={activeTask ? `Parar: ${activeTask.titulo}` : 'Parar cronômetro'}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-medium transition-colors',
          'text-[color:var(--brand)] hover:bg-[var(--brand-tint)] border border-[var(--brand)] border-opacity-40',
          stopping && 'opacity-50',
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse shrink-0" />
        {stopping ? '…' : fmtElapsed(elapsed)}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={starting}
        title="Iniciar cronômetro"
        className="icon-btn text-muted hover:text-ink"
        aria-label="Iniciar cronômetro"
      >
        {/* Clock/play icon */}
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="8" />
          <polyline points="10,5 10,10 13,12" />
        </svg>
      </button>
      {picking && (
        <TaskPickerModal
          onSelect={handleSelect}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
