'use client';

/**
 * Cronômetro start/stop. State derivado do DataProvider:
 *   - activeEntry = time entry com ended_at NULL do currentPessoa
 *   - start/stop fazem write no banco e refletem in-memory via mutators
 *
 * Não faz fetch local. Tela Timesheet e este hook compartilham a mesma
 * fonte de verdade (DataProvider.timeEntries), eliminando flashes.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from './supabase/client';
import { useData } from './data-store';
import { timeEntryFromDb } from './adapters';
import type { TimeEntry } from './types';

interface TimerState {
  activeEntry: TimeEntry | null;
  elapsed: number;
  starting: boolean;
  stopping: boolean;
  startTimer: (taskId: string) => Promise<void>;
  stopTimer: (note?: string) => Promise<void>;
  insertManualEntry: (taskId: string, startedAt: Date, endedAt: Date, note?: string) => Promise<void>;
}

const TimerContext = createContext<TimerState | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { currentPessoa, timeEntries, upsertTimeEntry } = useData();
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Active entry derivado: time entry do currentPessoa sem ended_at.
  const activeEntry = useMemo<TimeEntry | null>(() => {
    if (!currentPessoa?.id) return null;
    return (
      timeEntries.find((e) => e.pessoaId === currentPessoa.id && e.endedAt == null) ?? null
    );
  }, [timeEntries, currentPessoa?.id]);

  // Tick when running.
  useEffect(() => {
    if (!activeEntry) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsed(0);
      return;
    }
    const calc = () => Math.floor((Date.now() - activeEntry.startedAt) / 1000);
    setElapsed(calc());
    intervalRef.current = setInterval(() => setElapsed(calc()), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeEntry]);

  const startTimer = useCallback(
    async (taskId: string) => {
      if (!currentPessoa?.id || starting) return;
      setStarting(true);
      try {
        const supabase = createClient();
        // Fecha entry aberta anterior se houver.
        if (activeEntry) {
          const endedIso = new Date().toISOString();
          const { data: closed } = await supabase
            .from('time_entries')
            .update({ ended_at: endedIso })
            .eq('id', activeEntry.id)
            .select()
            .single();
          if (closed) upsertTimeEntry(timeEntryFromDb(closed));
        }
        const { data } = await supabase
          .from('time_entries')
          .insert({
            task_id: taskId,
            pessoa_id: currentPessoa.id,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (data) upsertTimeEntry(timeEntryFromDb(data));
      } finally {
        setStarting(false);
      }
    },
    [currentPessoa?.id, activeEntry, starting, upsertTimeEntry],
  );

  const stopTimer = useCallback(
    async (note?: string) => {
      if (!activeEntry || stopping) return;
      setStopping(true);
      try {
        const supabase = createClient();
        const update: Record<string, unknown> = { ended_at: new Date().toISOString() };
        if (note) update.note = note;
        const { data } = await supabase
          .from('time_entries')
          .update(update)
          .eq('id', activeEntry.id)
          .select()
          .single();
        if (data) upsertTimeEntry(timeEntryFromDb(data));
      } finally {
        setStopping(false);
      }
    },
    [activeEntry, stopping, upsertTimeEntry],
  );

  const insertManualEntry = useCallback(
    async (taskId: string, startedAt: Date, endedAt: Date, note?: string) => {
      if (!currentPessoa?.id) return;
      const supabase = createClient();
      const row: Record<string, unknown> = {
        task_id: taskId,
        pessoa_id: currentPessoa.id,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
      };
      if (note) row.note = note;
      const { data } = await supabase.from('time_entries').insert(row).select().single();
      if (data) upsertTimeEntry(timeEntryFromDb(data));
    },
    [currentPessoa?.id, upsertTimeEntry],
  );

  return (
    <TimerContext.Provider value={{ activeEntry, elapsed, starting, stopping, startTimer, stopTimer, insertManualEntry }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be inside TimerProvider');
  return ctx;
}

export function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${totalSec}s`;
}
