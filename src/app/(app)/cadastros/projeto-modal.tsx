'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { saveProjeto, type ProjetoPayload } from './actions';
import { useData } from '@/lib/data-store';

export type ProjetoInitial = {
  id: string;
  nome: string;
  clienteId: string;
  tipo: string | null;
  slaRespostaHoras: number | null;
  slaEntregaDias: number | null;
  orcamentoHoras: number | string | null;
};

export type ClienteOption = { id: string; nome: string };

const blank = (clienteId: string): ProjetoInitial => ({
  id: '',
  nome: '',
  clienteId,
  tipo: '',
  slaRespostaHoras: null,
  slaEntregaDias: null,
  orcamentoHoras: null,
});

function ProjetoModal({
  initial,
  clientes,
  onClose,
}: {
  initial: ProjetoInitial;
  clientes: ClienteOption[];
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial.nome);
  const [clienteId, setClienteId] = useState(initial.clienteId || '');
  const [tipo, setTipo] = useState(initial.tipo ?? '');
  const [slaR, setSlaR] = useState(
    initial.slaRespostaHoras == null ? '' : String(initial.slaRespostaHoras),
  );
  const [slaE, setSlaE] = useState(
    initial.slaEntregaDias == null ? '' : String(initial.slaEntregaDias),
  );
  const [orc, setOrc] = useState(
    initial.orcamentoHoras == null ? '' : String(initial.orcamentoHoras),
  );
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const { upsertProjeto } = useData();

  useEffect(() => {
    nomeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(() => {
    setErr(null);
    const payload: ProjetoPayload = {
      id: initial.id || null,
      nome,
      clienteId,
      tipo,
      slaRespostaHoras: slaR,
      slaEntregaDias: slaE,
      orcamentoHoras: orc,
    };
    startTransition(async () => {
      const res = await saveProjeto(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      upsertProjeto(res.data);
      onClose();
    });
  }, [initial.id, nome, clienteId, tipo, slaR, slaE, orc, onClose, upsertProjeto]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-bg p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card max-w-md w-full p-5 md:p-6" role="dialog" aria-label="Editar projeto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-brand text-lg font-semibold">
            {initial.id ? 'Editar projeto' : 'Novo projeto'}
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
              placeholder="Ex: WhatsApp Bot"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="lbl">Cliente</label>
            <select className="inp" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">—</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Tipo</label>
            <select className="inp" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">—</option>
              <option value="sustentacao">Sustentação</option>
              <option value="projeto">Projeto</option>
              <option value="discovery">Discovery</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="lbl">SLA resposta (h)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="inp"
                value={slaR}
                onChange={(e) => setSlaR(e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="lbl">SLA entrega (d)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="inp"
                value={slaE}
                onChange={(e) => setSlaE(e.target.value)}
                placeholder="—"
              />
            </div>
            <div>
              <label className="lbl">Orçamento (h)</label>
              <input
                type="number"
                min={0}
                step={1}
                className="inp"
                value={orc}
                onChange={(e) => setOrc(e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
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
            disabled={pending || !nome.trim() || !clienteId}
          >
            {pending ? 'salvando…' : initial.id ? 'salvar' : 'criar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewProjetoButton({ clientes }: { clientes: ClienteOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary text-xs" onClick={() => setOpen(true)}>
        + novo
      </button>
      {open && <ProjetoModal initial={blank('')} clientes={clientes} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditProjetoButton({
  projeto,
  clientes,
}: {
  projeto: ProjetoInitial;
  clientes: ClienteOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost-sm" onClick={() => setOpen(true)}>
        editar
      </button>
      {open && <ProjetoModal initial={projeto} clientes={clientes} onClose={() => setOpen(false)} />}
    </>
  );
}
