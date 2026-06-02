'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTimer, fmtElapsed } from '@/lib/use-timer';
import { useData, useClientesById } from '@/lib/data-store';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

const MAX_NOTE = 120;

function NoteModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center modal-bg px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="card w-full max-w-sm p-5" role="dialog" aria-label="Parar cronômetro">
        <h3 className="font-brand font-semibold mb-1">Parar cronômetro</h3>
        <p className="text-xs text-muted mb-3">
          Adicione uma nota ao registro — opcional, máx. {MAX_NOTE} caracteres.
        </p>
        <textarea
          ref={areaRef}
          className="inp w-full resize-none text-sm"
          style={{ height: '88px' }}
          placeholder="O que foi feito?"
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div
          className={`text-right text-xs mt-1 mb-4 tabular-nums ${
            note.length >= MAX_NOTE ? 'text-[color:var(--danger)]' : 'text-muted'
          }`}
        >
          {note.length}/{MAX_NOTE} caracteres
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-xs" onClick={() => onConfirm('')}>
            salvar sem nota
          </button>
          <button type="button" className="btn btn-primary text-xs" onClick={() => onConfirm(note)}>
            salvar
          </button>
        </div>
      </div>
    </div>
  );
}

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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const myId = currentPessoa?.id;
    return tasks
      .filter((t) => !t.arquivadoEm && t.status === 'andamento')
      .sort((a, b) => {
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
          <p className="text-sm text-muted text-center py-4">Nenhuma tarefa em andamento encontrada.</p>
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
  const [showNote, setShowNote] = useState(false);

  const activeTask = activeEntry ? tasks.find((t) => t.id === activeEntry.taskId) : null;

  async function handleSelect(taskId: string) {
    setPicking(false);
    await startTimer(taskId);
  }

  async function handleNoteConfirm(note: string) {
    setShowNote(false);
    await stopTimer(note || undefined);
  }

  // Rodando: pill verde com tempo HH:MM:SS visível + dot pulsando + ícone square (stop)
  if (activeEntry) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowNote(true)}
          disabled={stopping}
          title={activeTask ? `Parar: ${activeTask.titulo}` : 'Parar cronômetro'}
          className={cn('timer-btn running', stopping && 'opacity-60')}
        >
          <Icon name="square" size={13} />
          <span className="tabular-nums">{stopping ? '…' : fmtElapsed(elapsed)}</span>
        </button>
        {showNote && (
          <NoteModal onConfirm={handleNoteConfirm} onCancel={() => setShowNote(false)} />
        )}
      </>
    );
  }

  // Parado: pill neutra com ícone play
  return (
    <>
      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={starting}
        title="Iniciar cronômetro"
        className={cn('timer-btn', starting && 'opacity-60')}
        aria-label="Iniciar cronômetro"
      >
        <Icon name="play" size={13} />
        <span>Iniciar</span>
      </button>
      {picking && (
        <TaskPickerModal onSelect={handleSelect} onClose={() => setPicking(false)} />
      )}
    </>
  );
}
