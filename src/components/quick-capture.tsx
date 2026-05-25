'use client';

/**
 * Quick Capture — Onda 0 · 4.H
 *
 * Overlay mínimo (1 input) pra criar uma task em 2-5s sem trocar de
 * aba. Salva em backlog/backlog sem cliente/responsável/prazo — cai
 * na Triagem pra refinar depois. Permanece aberto pra captura
 * sequencial (faz Enter, limpa, mantém foco).
 *
 * Atalho global: ⌘⇧N (ou via Command Palette → "Captura rápida").
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/lib/data-store';
import { useToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { taskFromDb } from '@/lib/adapters';

type Api = { open: () => void; close: () => void; isOpen: boolean };
const Ctx = createContext<Api | null>(null);
export function useQuickCapture(): Api {
  const c = useContext(Ctx);
  if (!c) throw new Error('useQuickCapture precisa de <QuickCaptureProvider>');
  return c;
}

export function QuickCaptureProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const api = useMemo<Api>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
    [isOpen],
  );
  return (
    <Ctx.Provider value={api}>
      {children}
      {isOpen && <Modal onClose={() => setIsOpen(false)} />}
    </Ctx.Provider>
  );
}

function Modal({ onClose }: { onClose: () => void }) {
  const { upsertTask, currentPessoa } = useData();
  const toast = useToast();
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const [titulo, setTitulo] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const submit = useCallback(async () => {
    const t = titulo.trim();
    if (!t || sending) return;
    setSending(true);
    setTitulo('');
    const nowIso = new Date().toISOString();
    const payload = {
      titulo: t,
      descricao: '',
      cliente_id: null,
      projeto_id: null,
      pessoa_id: null,
      prioridade: 'P2',
      esforco: 4,
      complexidade: 'media',
      prazo: null,
      status: 'backlog',
      subetapa: 'backlog',
      tags: [],
      status_em: nowIso,
      subetapa_em: nowIso,
    };
    const { data, error } = await sb.from('tasks').insert(payload).select('*').single();
    setSending(false);
    if (error || !data) {
      toast.error('Erro ao capturar: ' + (error?.message ?? 'falha'));
      setTitulo(t);
      return;
    }
    upsertTask(taskFromDb(data as Record<string, unknown>));
    sb.from('task_field_history').insert({
      task_id: data.id,
      field: 'status',
      from_value: null,
      to_value: data.status,
      actor_pessoa_id: currentPessoa?.id ?? null,
      actor_source: 'app',
      occurred_at: nowIso,
    });
    toast.success('Tarefa capturada — vai pra Triagem.');
    // Mantém aberto pra próxima captura.
    inputRef.current?.focus();
  }, [titulo, sending, sb, upsertTask, currentPessoa, toast]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[20vh] px-3 palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="palette-shell w-full max-w-[560px]">
        <div className="palette-header">
          <input
            ref={inputRef}
            type="text"
            className="palette-input"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Captura rápida — só o título…"
            autoComplete="off"
            spellCheck={false}
            disabled={sending}
          />
          <span className="palette-kbd">↵</span>
        </div>
        <div className="palette-count">
          tarefa vai pra <strong>Triagem</strong> · sem cliente/responsável/prazo · enter envia e
          mantém aberto · ESC fecha
        </div>
      </div>
    </div>
  );
}
