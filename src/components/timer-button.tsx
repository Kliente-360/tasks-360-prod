'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTimer, fmtElapsed } from '@/lib/use-timer';
import { useData, useClientesById } from '@/lib/data-store';
import { useClickAway } from '@/lib/use-click-away';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { STAGE_RANK } from '@/lib/task-constants';

const MAX_NOTE = 120;

/** Popover de nota ao parar o cronômetro (comportamento existente). */
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

  useEffect(() => { areaRef.current?.focus(); }, []);
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
        <div className={`text-right text-xs mt-1 mb-3 tabular-nums ${note.length >= MAX_NOTE ? 'text-[color:var(--danger)]' : 'text-muted'}`}>
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
 * Seletor de tarefa com dois modos: iniciar cronômetro ou lançar horas.
 * Click na task seleciona (highlight). Os dois botões no rodapé se
 * habilitam após seleção.
 */
function TaskPickerPopover({
  onStart,
  onManual,
  onClose,
}: {
  onStart: (taskId: string) => void;
  onManual: (taskId: string) => void;
  onClose: () => void;
}) {
  const { tasks, currentPessoa } = useData();
  const clientesById = useClientesById();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useClickAway<HTMLDivElement>(onClose);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = useMemo(() => {
    const myId = currentPessoa?.id;
    return tasks
      .filter((t) => !t.arquivadoEm && (STAGE_RANK[t.subetapa] ?? -1) >= 1)
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
        <span className="text-sm font-medium">Selecionar tarefa</span>
      </div>
      <div className="p-3 pb-0">
        <input
          ref={inputRef}
          type="text"
          className="inp text-sm w-full mb-2"
          placeholder="Buscar tarefa ativa…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {candidates.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhuma tarefa ativa.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Nenhum resultado.</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto divide-y divide-line -mx-1">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full text-left px-2 py-2 transition-colors rounded',
                    selectedId === t.id ? 'bg-bg-alt' : 'hover:bg-bg-alt',
                  )}
                  onClick={() => setSelectedId(t.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{t.titulo}</div>
                      <div className="text-xs text-muted">{clientesById.get(t.clienteId)?.nome ?? ''}</div>
                    </div>
                    {selectedId === t.id && (
                      <Icon name="check" size={14} className="text-[color:var(--green)] shrink-0" />
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2 p-3 border-t border-line mt-2">
        <button
          type="button"
          className="btn btn-primary flex-1 text-xs gap-1 justify-center"
          disabled={!selectedId}
          onClick={() => selectedId && onStart(selectedId)}
        >
          <Icon name="play" size={12} />
          Iniciar
        </button>
        <button
          type="button"
          className="btn flex-1 text-xs gap-1 justify-center"
          disabled={!selectedId}
          onClick={() => selectedId && onManual(selectedId)}
        >
          <Icon name="edit" size={12} />
          Lançar horas
        </button>
      </div>
    </div>
  );
}

/**
 * Modal de lançamento manual de horas. Campos: data, hora início,
 * duração (Xh Ymin), nota. Preview do término em tempo real.
 * Bloqueia entradas que cruzam meia-noite.
 */
function ManualEntryPopover({
  taskTitulo,
  onConfirm,
  onCancel,
}: {
  taskTitulo: string;
  onConfirm: (startedAt: Date, endedAt: Date, note?: string) => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [durH, setDurH] = useState(0);
  const [durM, setDurM] = useState(0);
  const [note, setNote] = useState('');
  const ref = useClickAway<HTMLDivElement>(onCancel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const preview = useMemo(() => {
    if (!startTime) return null;
    const totalMin = durH * 60 + durM;
    if (totalMin < 1) return null;
    const [hh, mm] = startTime.split(':').map(Number);
    if (isNaN(hh) || isNaN(mm)) return null;
    const endMin = hh * 60 + mm + totalMin;
    if (endMin > 1439) return { error: 'Cruza meia-noite — reduza a duração.' } as const;
    const endH = Math.floor(endMin / 60);
    const endM = endMin % 60;
    const durLabel = durH > 0 && durM > 0
      ? `${durH}h ${durM}min`
      : durH > 0 ? `${durH}h` : `${durM}min`;
    return {
      endHHMM: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      durLabel,
      error: null,
    } as const;
  }, [startTime, durH, durM]);

  const canSubmit = !!date && !!startTime && preview !== null && preview.error === null;

  function handleSubmit() {
    if (!canSubmit || !preview || preview.error) return;
    const startedAt = new Date(`${date}T${startTime}:00`);
    const endedAt = new Date(startedAt.getTime() + (durH * 60 + durM) * 60_000);
    onConfirm(startedAt, endedAt, note.trim() || undefined);
  }

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 z-50 w-[360px] max-w-[calc(100vw-24px)] bg-bg-elev border border-line rounded-lg shadow-xl overflow-hidden"
      role="dialog"
      aria-label="Lançar horas"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="w-2 h-2 rounded-full bg-[color:var(--green)] shrink-0" />
        <span className="text-sm font-medium">Lançar horas</span>
      </div>
      <div className="p-3 flex flex-col gap-3">
        <p className="text-xs text-muted truncate" title={taskTitulo}>{taskTitulo}</p>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted w-14 shrink-0">Data</label>
          <input
            type="date"
            className="inp text-sm flex-1"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted w-14 shrink-0">Início</label>
          <input
            type="time"
            className="inp text-sm flex-1"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted w-14 shrink-0">Duração</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              className="inp text-sm w-14 text-center"
              min={0}
              max={23}
              value={durH}
              onChange={(e) => setDurH(Math.min(23, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            />
            <span className="text-xs text-muted">h</span>
            <input
              type="number"
              className="inp text-sm w-14 text-center"
              min={0}
              max={59}
              value={durM}
              onChange={(e) => setDurM(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
            />
            <span className="text-xs text-muted">min</span>
          </div>
        </div>

        {preview && (
          <p className={`text-xs -mt-1 ${preview.error ? 'text-[color:var(--danger)]' : 'text-muted'}`}>
            {preview.error ?? `Término: ${preview.endHHMM} · ${preview.durLabel}`}
          </p>
        )}

        <div>
          <textarea
            className="inp w-full resize-none text-sm"
            style={{ height: '72px' }}
            placeholder="Nota — opcional"
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={`text-right text-xs mt-0.5 tabular-nums ${note.length >= MAX_NOTE ? 'text-[color:var(--danger)]' : 'text-muted'}`}>
            {note.length}/{MAX_NOTE}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-xs" onClick={onCancel}>cancelar</button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Lançar
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimerButton() {
  const { activeEntry, elapsed, starting, stopping, startTimer, stopTimer, insertManualEntry } = useTimer();
  const { tasks } = useData();
  const [picking, setPicking] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [manualTask, setManualTask] = useState<{ id: string; titulo: string } | null>(null);

  const activeTask = activeEntry ? tasks.find((t) => t.id === activeEntry.taskId) : null;

  async function handleStart(taskId: string) {
    setPicking(false);
    await startTimer(taskId);
  }

  function handleManual(taskId: string) {
    setPicking(false);
    const task = tasks.find((t) => t.id === taskId);
    if (task) setManualTask({ id: task.id, titulo: task.titulo });
  }

  async function handleNoteConfirm(note: string) {
    setShowNote(false);
    await stopTimer(note || undefined);
  }

  async function handleManualConfirm(startedAt: Date, endedAt: Date, note?: string) {
    if (!manualTask) return;
    await insertManualEntry(manualTask.id, startedAt, endedAt, note);
    setManualTask(null);
  }

  // Rodando: pill vermelha (REC) com tempo + botão stop.
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

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={() => setPicking(true)}
        disabled={starting}
        title="Cronômetro / lançar horas"
        className={cn('iconbtn', starting && 'opacity-60')}
        aria-label="Cronômetro"
      >
        <Icon name="timer" size={18} />
      </button>
      {picking && (
        <TaskPickerPopover
          onStart={handleStart}
          onManual={handleManual}
          onClose={() => setPicking(false)}
        />
      )}
      {manualTask && (
        <ManualEntryPopover
          taskTitulo={manualTask.titulo}
          onConfirm={handleManualConfirm}
          onCancel={() => setManualTask(null)}
        />
      )}
    </div>
  );
}
