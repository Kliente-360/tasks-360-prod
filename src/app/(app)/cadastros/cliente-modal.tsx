'use client';

/**
 * Modal de criar/editar Cliente.
 *
 * Pós-refactor v1.02.226: chama Supabase JS direto do client (sem Server
 * Action + Drizzle), mesmo padrão de Backlog/Kanban/Modal. Latência cai
 * de ~300-600ms pra ~50-150ms (round-trip único, sem Edge runtime
 * intermediando).
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useData } from '@/lib/data-store';
import { createClient } from '@/lib/supabase/client';
import { clienteFromDb } from '@/lib/adapters';
import { normalizeDominio } from '@/lib/utils';

type ClienteInitial = {
  id: string;
  nome: string;
  tier: string | null;
  ehInterno: boolean;
  dominios: string[];
};

const BLANK: ClienteInitial = {
  id: '',
  nome: '',
  tier: '',
  ehInterno: false,
  dominios: [],
};

function ClienteModal({
  initial,
  onClose,
}: {
  initial: ClienteInitial;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial.nome);
  const [tier, setTier] = useState(initial.tier ?? '');
  const [dominios, setDominios] = useState<string[]>(initial.dominios);
  const [newDominio, setNewDominio] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const { upsertCliente } = useData();

  useEffect(() => {
    nomeRef.current?.focus();
  }, []);

  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addDominio = useCallback(() => {
    const d = normalizeDominio(newDominio);
    if (!d) {
      setErr('Domínio inválido (ex: bodytech.com.br).');
      return;
    }
    if (!dominios.includes(d)) setDominios([...dominios, d]);
    setNewDominio('');
    setErr(null);
  }, [newDominio, dominios]);

  const submit = useCallback(() => {
    setErr(null);
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      setErr('Nome obrigatório.');
      return;
    }
    const dominiosNorm = Array.from(
      new Set(dominios.map((d) => normalizeDominio(d)).filter(Boolean)),
    );
    const tierVal = tier || null;
    startTransition(async () => {
      const sb = createClient();
      const baseRow = { nome: nomeTrim, tier: tierVal, dominios: dominiosNorm };
      const { data, error } = initial.id
        ? await sb
            .from('clientes')
            .update(baseRow)
            .eq('id', initial.id)
            .select()
            .single()
        : await sb
            .from('clientes')
            .insert({ ...baseRow, eh_interno: false })
            .select()
            .single();
      if (error || !data) {
        setErr(error?.message || 'Falha ao salvar.');
        return;
      }
      upsertCliente(clienteFromDb(data as Record<string, unknown>));
      onClose();
    });
  }, [initial.id, nome, tier, dominios, onClose, upsertCliente]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-bg p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card max-w-md w-full p-5 md:p-6" role="dialog" aria-label="Editar cliente">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-brand text-lg font-semibold">
            {initial.id ? 'Editar cliente' : 'Novo cliente'}
          </h2>
          <button type="button" className="icon-btn text-muted" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="lbl">Nome</label>
            <input
              ref={nomeRef}
              type="text"
              className="inp"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Bodytech"
              autoComplete="off"
            />
          </div>

          {!initial.ehInterno && (
            <>
              <div>
                <label className="lbl">Tier</label>
                <select className="inp" value={tier} onChange={(e) => setTier(e.target.value)}>
                  <option value="">—</option>
                  <option value="estrategico">Estratégico</option>
                  <option value="potencial">Potencial</option>
                  <option value="descoberta">Descoberta</option>
                </select>
              </div>

              <div>
                <label className="lbl">Domínios de email</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="inp flex-1"
                    value={newDominio}
                    onChange={(e) => setNewDominio(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDominio();
                      }
                    }}
                    placeholder="ex: bodytech.com.br"
                  />
                  <button
                    type="button"
                    className="btn text-sm"
                    onClick={addDominio}
                    disabled={!newDominio.trim()}
                  >
                    adicionar
                  </button>
                </div>
                <div className="text-[11px] text-muted mt-1">
                  Pra automação IA identificar mensagens do cliente pelo email dos participantes.
                </div>
                {dominios.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {dominios.map((d) => (
                      <span key={d} className="tag-chip">
                        {d}
                        <button
                          type="button"
                          className="ml-1 text-muted hover:text-danger"
                          onClick={() => setDominios(dominios.filter((x) => x !== d))}
                          title="Remover"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {initial.ehInterno && (
            <div className="text-xs text-muted italic">
              Cliente interno (bucket de gestão). Tier e domínios não se aplicam.
            </div>
          )}
        </div>

        {err && <div className="text-sm text-[color:var(--danger)] mt-3">{err}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={pending || !nome.trim()}
          >
            {pending ? 'salvando…' : initial.id ? 'salvar' : 'criar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Botão "+ novo cliente" ============
export function NewClienteButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary text-xs"
        onClick={() => setOpen(true)}
      >
        + novo
      </button>
      {open && <ClienteModal initial={BLANK} onClose={() => setOpen(false)} />}
    </>
  );
}

// ============ Botão "editar" por linha ============
export function EditClienteButton({ cliente }: { cliente: ClienteInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost-sm" onClick={() => setOpen(true)}>
        editar
      </button>
      {open && <ClienteModal initial={cliente} onClose={() => setOpen(false)} />}
    </>
  );
}
