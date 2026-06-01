'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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
  stopTimer: () => Promise<void>;
}

const TimerContext = createContext<TimerState | null>(null);

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const { currentPessoa } = useData();
  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // On boot: check for any open entry (ended_at IS NULL)
  useEffect(() => {
    if (!currentPessoa?.id) return;
    const supabase = createClient();
    supabase
      .from('time_entries')
      .select('*')
      .eq('pessoa_id', currentPessoa.id)
      .is('ended_at', null)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setActiveEntry(timeEntryFromDb(data));
      });
  }, [currentPessoa?.id]);

  // Tick when running
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

  const startTimer = useCallback(async (taskId: string) => {
    if (!currentPessoa?.id || starting) return;
    setStarting(true);
    try {
      const supabase = createClient();
      // Close any existing open entry first
      if (activeEntry) {
        await supabase
          .from('time_entries')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', activeEntry.id);
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
      if (data) setActiveEntry(timeEntryFromDb(data));
    } finally {
      setStarting(false);
    }
  }, [currentPessoa?.id, activeEntry, starting]);

  const stopTimer = useCallback(async () => {
    if (!activeEntry || stopping) return;
    setStopping(true);
    try {
      const supabase = createClient();
      await supabase
        .from('time_entries')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', activeEntry.id);
      setActiveEntry(null);
    } finally {
      setStopping(false);
    }
  }, [activeEntry, stopping]);

  return (
    <TimerContext.Provider value={{ activeEntry, elapsed, starting, stopping, startTimer, stopTimer }}>
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
