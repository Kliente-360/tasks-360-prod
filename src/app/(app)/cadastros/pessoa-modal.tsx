'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { savePessoa, type PessoaPayload } from './actions';
import type { ClienteOption } from './projeto-modal';
import { useData } from '@/lib/data-store';
import { SKILL_GROUPS } from '@/lib/task-constants';

export type PessoaInitial = {
  id: string;
  nome: string;
  email: string | null;
  role: 'admin' | 'interno' | 'cliente';
  clienteId: string | null;
  clientePrincipalId: string | null;
  clienteSecundarioId: string | null;
  capacidadeHorasSemana: number | string | null;
  skills: string[];
  senioridade: string | null;
};

const BLANK: PessoaInitial = {
  id: '',
  nome: '',
  email: '',
  role: 'interno',
  clienteId: null,
  clientePrincipalId: null,
  clienteSecundarioId: null,
  capacidadeHorasSemana: 40,
  skills: [],
  senioridade: '',
};

function PessoaModal({
  initial,
  clientes,
  onClose,
}: {
  initial: PessoaInitial;
  clientes: ClienteOption[];
  onClose: () => void;
}) {
  const [nome, setNome] = useState(initial.nome);
  const [email, setEmail] = useState(initial.email ?? '');
  const [role, setRole] = useState<PessoaInitial['role']>(initial.role);
  const [clienteId, setClienteId] = useState(initial.clienteId ?? '');
  const [clientePrincipalId, setClientePrincipalId] = useState(initial.clientePrincipalId ?? '');
  const [clienteSecundarioId, setClienteSecundarioId] = useState(initial.clienteSecundarioId ?? '');
  const [capacidade, setCapacidade] = useState(
    initial.capacidadeHorasSemana == null ? '40' : String(initial.capacidadeHorasSemana),
  );
  const [skills, setSkills] = useState<string[]>(initial.skills);
  const [senioridade, setSenioridade] = useState(initial.senioridade ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nomeRef = useRef<HTMLInputElement | null>(null);
  const { upsertPessoa } = useData();

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
    const finalSkills = [...skills];

    const payload: PessoaPayload = {
      id: initial.id || null,
      nome,
      email,
      role,
      clienteId,
      clientePrincipalId,
      clienteSecundarioId,
      capacidadeHorasSemana: capacidade,
      skills: finalSkills,
      senioridade,
    };
    startTransition(async () => {
      const res = await savePessoa(payload);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      upsertPessoa(res.data);
      onClose();
    });
  }, [
    initial.id,
    nome,
    email,
    role,
    clienteId,
    clientePrincipalId,
    clienteSecundarioId,
    capacidade,
    skills,
    senioridade,
    onClose,
    upsertPessoa,
  ]);

  const isCliente = role === 'cliente';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-bg p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card max-w-lg w-full p-5 md:p-6" role="dialog" aria-label="Editar pessoa">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-brand text-lg font-semibold">
            {initial.id ? 'Editar pessoa' : 'Nova pessoa'}
          </h2>
          <button type="button" className="icon-btn text-muted" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="lbl">Nome</label>
              <input
                ref={nomeRef}
                type="text"
                className="inp"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="lbl">Email</label>
              <input
                type="email"
                className="inp"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="pessoa@kliente360.com"
                autoComplete="off"
              />
            </div>
          </div>

          <div>
            <label className="lbl">Papel</label>
            <select
              className="inp"
              value={role}
              onChange={(e) => setRole(e.target.value as PessoaInitial['role'])}
            >
              <option value="admin">Admin</option>
              <option value="interno">Interno</option>
              <option value="cliente">Cliente externo</option>
            </select>
          </div>

          {isCliente && (
            <div>
              <label className="lbl">Cliente vinculado</label>
              <select
                className="inp"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
              >
                <option value="">—</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isCliente && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Cliente principal</label>
                  <select
                    className="inp"
                    value={clientePrincipalId}
                    onChange={(e) => setClientePrincipalId(e.target.value)}
                  >
                    <option value="">—</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Cliente secundário</label>
                  <select
                    className="inp"
                    value={clienteSecundarioId}
                    onChange={(e) => setClienteSecundarioId(e.target.value)}
                  >
                    <option value="">—</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Senioridade</label>
                  <select
                    className="inp"
                    value={senioridade}
                    onChange={(e) => setSenioridade(e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="junior">Júnior</option>
                    <option value="pleno">Pleno</option>
                    <option value="senior">Sênior</option>
                    <option value="lead">Lead</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Capacidade (h/sem)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="inp"
                    value={capacidade}
                    onChange={(e) => setCapacidade(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="lbl">Skills</label>
                <div className="flex flex-col gap-2 mt-1">
                  {SKILL_GROUPS.map((g) => (
                    <div key={g.group}>
                      <div className="text-[10px] uppercase tracking-wide text-muted mb-1">{g.group}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.values.map((skill) => {
                          const active = skills.includes(skill);
                          return (
                            <button
                              key={skill}
                              type="button"
                              onClick={() =>
                                setSkills(active ? skills.filter((s) => s !== skill) : [...skills, skill])
                              }
                              className={`text-xs px-2 py-1 rounded border transition-colors ${
                                active
                                  ? 'bg-[var(--brand)] border-[var(--brand)] text-white font-medium'
                                  : 'bg-[var(--surface-3)] border-[var(--line)] text-muted hover:border-[var(--brand)] hover:text-[var(--brand)]'
                              }`}
                            >
                              {skill}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
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

export function NewPessoaButton({ clientes }: { clientes: ClienteOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-primary text-xs" onClick={() => setOpen(true)}>
        + novo
      </button>
      {open && <PessoaModal initial={BLANK} clientes={clientes} onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditPessoaButton({
  pessoa,
  clientes,
}: {
  pessoa: PessoaInitial;
  clientes: ClienteOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost-sm" onClick={() => setOpen(true)}>
        editar
      </button>
      {open && <PessoaModal initial={pessoa} clientes={clientes} onClose={() => setOpen(false)} />}
    </>
  );
}
