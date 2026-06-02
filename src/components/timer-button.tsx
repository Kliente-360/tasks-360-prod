'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTimer, fmtElapsed } from '@/lib/use-timer';
import { useData, useClientesById } from '@/lib/data-store';
import { useClickAway } from '@/lib/use-click-away';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';

const MAX_NOTE = 120;

/**
 * Popover pra registrar nota ao parar o cronômetro. Ancorado no
 * próprio TimerButton (dropdown), mesmo padrão do TaskPickerPopover —
 * sem overlay fullscreen que cobre o header. Click-fora cancela.
 */
function NotePopover({
  onConfirm,
  onCancel,
}: {
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const ref = useClickAway<HTMLDivElement>(onCancel);

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
      ref={ref}
      className="absolute top-full right-0 mt-2 z-50 w-[360px] max-w-[calc(100vw-24px)] bg-bg-elev border border-line rounded-lg shadow-xl overflow-hidden"
      role="dialog"
      aria-label="Parar cronômetro"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="w-2 h-2 rounded-full bg-[color:var(--danger)] shrink-0" />
        <span className="text-sm font-medium">Parar cronômetro</span>
      </div>
      <div className="p-3">
        <p className="text-xs text-muted mb-2">
          Adicione uma nota — opcional, máx. {MAX_NOTE} caracteres.
        </p>
        <textarea
          ref={areaRef}
          className="inp w-full resize-none text-sm"
          style={{ height: '80px' }}
          placeholder="O que foi feito?"
          maxLength={MAX_NOTE}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div
          className={`text-right text-xs mt-1 mb-3 tabular-nums ${
            note.length >= MAX_NOTE ? 'text-[color:var(--danger)]' : 'text-muted'
          }`}
        >
          {note.length}/{MAX_NOTE}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-xs" onClick={() => onConfirm('')}>
            sem nota
          </button>
          <button type="button" className="btn btn-primary text-xs" onClick={() => onConfirm(note)}>
            salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Popover dropdown ancorado no botão TimerButton. Substitui o modal
 * fullscreen anterior (que cobria header inteiro com overlay cinza —
 * UX ruim pra escolha rápida). Padrão similar ao NotifBell.
 */
function TaskPickerPopover({
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
  const ref = useClickAway<HTMLDivElement>(onClose);

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
      ref={ref}
      className="absolute top-full right-0 mt-2 z-50 w-[360px] max-w-[calc(100vw-24px)] bg-bg-elev border border-line rounded-lg shadow-xl overflow-hidden"
      role="dialog"
      aria-label="Selecionar tarefa"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="w-2 h-2 rounded-full bg-[color:var(--green)] shrink-0" />
        <span className="text-sm font-medium">Iniciar cronômetro</span>
      </div>
      <div className="p-3">
        <input
          ref={inputRef}
          type="text"
          className="inp text-sm w-full mb-2"
          placeholder="Buscar tarefa em andamento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {candidates.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhuma tarefa em andamento.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhum resultado.</p>
        ) : (
          <ul className="max-h-72 overflow-y-auto divide-y divide-line -mx-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-2 hover:bg-bg-alt transition-colors rounded"
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

  // Rodando: pill vermelha (REC) com tempo HH:MM:SS + dot pulsando + ícone
  // square (stop). Wrapper `relative inline-flex` ancora o NotePopover.
  if (activeEntry) {
    return (
      <div className="relative inline-flex">
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
          <NotePopover onConfirm={handleNoteConfirm} onCancel={() => setShowNote(false)} />
        )}
      </div>
    );
  }

  // Parado: ícone-only (compacto, igual ao padrão de utilitários do header).
  // Ao clicar, abre popover dropdown ancorado embaixo — não modal fullscreen.
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={starting}
        title="Iniciar cronômetro"
        className={cn('iconbtn', starting && 'opacity-60')}
        aria-label="Iniciar cronômetro"
      >
        <Icon name="timer" size={18} />
      </button>
      {picking && (
        <TaskPickerPopover onSelect={handleSelect} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
