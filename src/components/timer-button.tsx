'use client';
import { track } from '@/lib/telemetry';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTimer, fmtElapsed } from '@/lib/use-timer';
import { useData, useClientesById } from '@/lib/data-store';
import { useClickAway } from '@/lib/use-click-away';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { STAGE_RANK } from '@/lib/task-constants';

const MAX_NOTE = 120;
/** Nota obrigatória ao parar o cronômetro ou lançar horas (nov/2026). */
export const MIN_NOTE = 5;

/** Popover de nota ao parar o cronômetro (comportamento existente).
 *  Exportado pra reuso no botão de cronômetro do modal de task (T.1). */
export function NotePopover({
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
          <button type="button" className="btn text-xs" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary text-xs"
            disabled={note.trim().length < MIN_NOTE}
            onClick={() => onConfirm(note.trim())}
          >
            Salvar
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

/** Atalhos de duração do lançamento (minutos). */
const ATALHOS_DURACAO: [string, number][] = [['15m', 15], ['30m', 30], ['1h', 60], ['2h', 120], ['4h', 240]];

/**
 * Formulário único de lançamento de horas (nov/2026) · usado no cronômetro
 * do topo, no Timesheet (edição) e no modal da tarefa. Sem hora de início:
 * a duração é o total trabalhado no dia. Hoje → termina agora; outro dia →
 * termina às 18h. Na edição, mantém o horário de início original.
 */
export function LancamentoForm({
  taskTitulo,
  initial,
  onConfirm,
  onCancel,
}: {
  taskTitulo?: string;
  initial?: { startedAt: Date; endedAt: Date; note?: string };
  onConfirm: (startedAt: Date, endedAt: Date, note: string) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = isoLocal(new Date());
  const isEdit = !!initial;
  const initFrom = useMemo(() => {
    if (!initial) return null;
    const mins = Math.max(0, Math.round((initial.endedAt.getTime() - initial.startedAt.getTime()) / 60_000));
    return { dateIso: isoLocal(initial.startedAt), durH: Math.floor(mins / 60), durM: mins % 60, note: initial.note ?? '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);
  const [date, setDate] = useState(initFrom?.dateIso ?? today);
  const [durH, setDurH] = useState(initFrom?.durH ?? 0);
  const [durM, setDurM] = useState(initFrom?.durM ?? 0);
  const [note, setNote] = useState(initFrom?.note ?? '');
  const [enviando, setEnviando] = useState(false);
  const totalMin = durH * 60 + durM;
  const canSubmit = !!date && totalMin >= 1 && totalMin <= 24 * 60 && note.trim().length >= MIN_NOTE && !enviando;

  async function handleSubmit() {
    if (!canSubmit) return;
    const [y, m, d] = date.split('-').map(Number);
    const durMs = totalMin * 60_000;
    let startedAt: Date;
    let endedAt: Date;
    if (initial) {
      startedAt = new Date(y, m - 1, d, initial.startedAt.getHours(), initial.startedAt.getMinutes());
      endedAt = new Date(startedAt.getTime() + durMs);
    } else {
      endedAt = date === today ? new Date() : new Date(y, m - 1, d, 18, 0, 0);
      startedAt = new Date(endedAt.getTime() - durMs);
      const inicioDoDia = new Date(y, m - 1, d, 0, 0, 0);
      if (startedAt < inicioDoDia) {
        startedAt = inicioDoDia;
        endedAt = new Date(inicioDoDia.getTime() + durMs);
      }
    }
    setEnviando(true);
    try {
      await onConfirm(startedAt, endedAt, note.trim());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="lanc-form" role="dialog" aria-label={isEdit ? 'Editar registro' : 'Lançar horas'}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
        <div className="w-2 h-2 rounded-full bg-[color:var(--green)] shrink-0" />
        <span className="text-sm font-medium">{isEdit ? 'Editar registro' : 'Lançar horas'}</span>
      </div>
      <div className="p-3 flex flex-col gap-3">
        {taskTitulo && <p className="text-xs text-muted truncate" title={taskTitulo}>{taskTitulo}</p>}

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted w-14 shrink-0">Data</label>
          <input type="date" className="inp text-sm flex-1" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="flex items-start gap-2">
          <label className="text-xs text-muted w-14 shrink-0 pt-2">Duração</label>
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                className="inp text-sm w-14 text-center"
                min={0}
                max={24}
                value={durH}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDurH(Math.min(24, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                aria-label="Horas"
              />
              <span className="text-xs text-muted">h</span>
              <input
                type="number"
                inputMode="numeric"
                className="inp text-sm w-14 text-center"
                min={0}
                max={59}
                step={5}
                value={durM}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDurM(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                aria-label="Minutos"
              />
              <span className="text-xs text-muted">min</span>
            </div>
            <div className="lanc-atalhos">
              {ATALHOS_DURACAO.map(([l, min]) => (
                <button
                  key={l}
                  type="button"
                  disabled={totalMin + min > 24 * 60}
                  onClick={(e) => {
                    const novo = Math.min(24 * 60, totalMin + min);
                    setDurH(Math.floor(novo / 60));
                    setDurM(novo % 60);
                    // "aperta" o botão: animação curta e volta ao normal
                    const el = e.currentTarget;
                    el.classList.remove('somou');
                    void el.offsetWidth;
                    el.classList.add('somou');
                  }}
                  onAnimationEnd={(e) => e.currentTarget.classList.remove('somou')}
                >
                  +{l}
                </button>
              ))}
              {totalMin > 0 && (
                <button type="button" className="zerar" onClick={() => { setDurH(0); setDurM(0); }}>
                  Zerar
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <textarea
            className="inp w-full resize-none text-sm"
            style={{ height: '72px' }}
            placeholder="O que foi feito?"
            maxLength={MAX_NOTE}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
            }}
          />
          <div className={`text-right text-xs mt-0.5 tabular-nums ${note.length >= MAX_NOTE ? 'text-[color:var(--danger)]' : 'text-muted'}`}>
            {note.length}/{MAX_NOTE}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn text-xs" onClick={onCancel}>Cancelar</button>
          <button type="button" className="btn btn-primary text-xs" disabled={!canSubmit} onClick={handleSubmit}>
            {enviando ? 'Salvando…' : isEdit ? 'Salvar' : 'Lançar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Popover posicionado do formulário (cronômetro do topo e Timesheet). */
export function ManualEntryPopover({
  taskTitulo,
  initial,
  onConfirm,
  onCancel,
}: {
  taskTitulo: string;
  initial?: { startedAt: Date; endedAt: Date; note?: string };
  onConfirm: (startedAt: Date, endedAt: Date, note?: string) => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const ref = useClickAway<HTMLDivElement>(onCancel);
  // Abre para baixo; se não couber (registro no fim da lista), abre para cima
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const overflowsBottom = rect.bottom > window.innerHeight - 8;
    const parentRect = el.parentElement?.getBoundingClientRect();
    const spaceAbove = parentRect ? parentRect.top : rect.top;
    if (overflowsBottom && spaceAbove >= rect.height + 8) setPlacement('top');
  }, [ref]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      ref={ref}
      className={cn(
        'absolute right-0 z-50 w-[360px] max-w-[calc(100vw-24px)] bg-bg-elev border border-line rounded-lg shadow-xl overflow-hidden',
        placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
      )}
    >
      <LancamentoForm taskTitulo={taskTitulo} initial={initial} onConfirm={onConfirm} onCancel={onCancel} />
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
    track('timer_start', { task_id: taskId, props: { origem: 'header' } });
    await startTimer(taskId);
  }

  function handleManual(taskId: string) {
    setPicking(false);
    const task = tasks.find((t) => t.id === taskId);
    if (task) setManualTask({ id: task.id, titulo: task.titulo });
  }

  async function handleNoteConfirm(note: string) {
    setShowNote(false);
    track('timer_stop', { props: { origem: 'header', com_nota: !!note } });
    await stopTimer(note || undefined);
  }

  async function handleManualConfirm(startedAt: Date, endedAt: Date, note?: string) {
    if (!manualTask) return;
    track('timesheet_lancamento', { task_id: manualTask.id, props: { origem: 'cronometro_header' } });
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
