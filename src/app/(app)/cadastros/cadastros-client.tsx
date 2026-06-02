'use client';

/**
 * Cadastros — Client Component consumindo useData().
 *
 * Pós-refactor v1.02.226: writes via Supabase JS direto do client (sem
 * Server Actions + Drizzle), mesmo padrão de Backlog/Kanban/Modal.
 * Latência cai de ~300-600ms pra ~50-150ms.
 *
 * Listas vêm da store em memória (igual antes). Mutators do data-store
 * refletem in-memory pra UX instantânea.
 */

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useData } from '@/lib/data-store';
import { useToast } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { clienteFromDb, projetoFromDb } from '@/lib/adapters';
import { cn } from '@/lib/utils';
import { NewClienteButton, EditClienteButton } from './cliente-modal';
import { NewProjetoButton, EditProjetoButton } from './projeto-modal';
import { NewPessoaButton, EditPessoaButton } from './pessoa-modal';

type Tab = 'clientes' | 'projetos' | 'pessoas';

export function CadastrosClient() {
  const {
    clientes,
    projetos,
    pessoas,
    tasks,
    loading,
    error,
    upsertCliente,
    upsertProjeto,
    upsertPessoa,
    removeCliente,
    removeProjeto,
    removePessoa,
    viewerRole,
  } = useData();
  const isAdmin = viewerRole === 'admin';

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const [tab, setTab] = useState<Tab>('clientes');
  const [showArquivados, setShowArquivados] = useState(false);
  const toast = useToast();

  // ===== Indices =====
  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const projetosAtivos = useMemo(() => projetos.filter((p) => !p.arquivadoEm), [projetos]);

  const tasksByCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.arquivadoEm) continue;
      if (!t.clienteId) continue;
      m.set(t.clienteId, (m.get(t.clienteId) ?? 0) + 1);
    }
    return m;
  }, [tasks]);
  const tasksByProjeto = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.arquivadoEm) continue;
      if (!t.projetoId) continue;
      m.set(t.projetoId, (m.get(t.projetoId) ?? 0) + 1);
    }
    return m;
  }, [tasks]);
  const tasksByPessoa = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) {
      if (t.arquivadoEm) continue;
      if (!t.pessoaId) continue;
      m.set(t.pessoaId, (m.get(t.pessoaId) ?? 0) + 1);
    }
    return m;
  }, [tasks]);
  const projetosByCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of projetos) {
      if (p.arquivadoEm) continue;
      if (!p.clienteId) continue;
      m.set(p.clienteId, (m.get(p.clienteId) ?? 0) + 1);
    }
    return m;
  }, [projetos]);

  const clienteOptions = useMemo(
    () => clientes.map((c) => ({ id: c.id, nome: c.nome })),
    [clientes],
  );

  const clientesSemDominio = useMemo(
    () =>
      clientes.filter(
        (c) => !c.ehInterno && !c.arquivadoEm && (!c.dominios || c.dominios.length === 0),
      ),
    [clientes],
  );

  // ===== Action helpers (com transition pra feedback) =====
  const [, startTransition] = useTransition();

  // Arquivar/desarquivar: update simples. arquivado_em = now / null.
  const setClienteArquivado = (id: string, arquivado: boolean) =>
    startTransition(async () => {
      const arquivado_em = arquivado ? new Date().toISOString() : null;
      const { data, error } = await sb
        .from('clientes')
        .update({ arquivado_em })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message || 'Cliente não encontrado.');
        return;
      }
      upsertCliente(clienteFromDb(data as Record<string, unknown>));
    });
  const runArquivarCliente = (id: string) => setClienteArquivado(id, true);
  const runDesarquivarCliente = (id: string) => setClienteArquivado(id, false);
  const runDeleteCliente = (id: string, nome: string) => {
    const tcount = tasksByCliente.get(id) ?? 0;
    const pcount = projetosByCliente.get(id) ?? 0;
    if (tcount || pcount) {
      toast.error(`Não é possível excluir: existem ${tcount} tarefa(s) e ${pcount} projeto(s) vinculados.`);
      return;
    }
    if (!confirm(`Excluir cliente "${nome}"?`)) return;
    startTransition(async () => {
      const { error } = await sb.from('clientes').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      removeCliente(id);
    });
  };

  const setProjetoArquivado = (id: string, arquivado: boolean) =>
    startTransition(async () => {
      const arquivado_em = arquivado ? new Date().toISOString() : null;
      const { data, error } = await sb
        .from('projetos')
        .update({ arquivado_em })
        .eq('id', id)
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message || 'Projeto não encontrado.');
        return;
      }
      upsertProjeto(projetoFromDb(data as Record<string, unknown>));
    });
  const runArquivarProjeto = (id: string) => setProjetoArquivado(id, true);
  const runDesarquivarProjeto = (id: string) => setProjetoArquivado(id, false);
  const runDeleteProjeto = (id: string, nome: string) => {
    const tcount = tasksByProjeto.get(id) ?? 0;
    if (tcount) {
      toast.error(`Não é possível excluir: existem ${tcount} tarefa(s) vinculadas.`);
      return;
    }
    if (!confirm(`Excluir projeto "${nome}"?`)) return;
    startTransition(async () => {
      const { error } = await sb.from('projetos').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      removeProjeto(id);
    });
  };

  // Convida cliente externo: marca invited_at + dispara magic link.
  // Espelho de anexos.js:667 (Alpine). 1) sempre marca invited_at antes
  // do email pra liberar acesso futuro mesmo se o send falhar; 2) o
  // magic link redireciona pro mesmo domínio onde o cadastro abriu —
  // funciona em preview Vercel sem hard-coding.
  const runConvidarPessoa = useCallback(
    async (id: string, nome: string, email: string | null) => {
      if (!email) {
        toast.error(`${nome} não tem email cadastrado. Edite a pessoa antes.`);
        return;
      }
      const nowIso = new Date().toISOString();
      const prev = pessoas.find((p) => p.id === id);
      const { error: upErr } = await sb.from('pessoas').update({ invited_at: nowIso }).eq('id', id);
      if (upErr) {
        toast.error('Erro ao marcar convite: ' + upErr.message);
        return;
      }
      if (prev) upsertPessoa({ ...prev, invited_at: nowIso });
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) {
        toast.error('Convite marcado, mas falha ao enviar email: ' + error.message);
        return;
      }
      toast.success(`Convite enviado para ${email}`);
    },
    [pessoas, sb, toast, upsertPessoa],
  );

  // Ativa interno/admin: só marca invited_at (login é via Google).
  const runAtivarPessoa = useCallback(
    async (id: string, nome: string, email: string | null) => {
      if (!email) {
        toast.error(`${nome} não tem email. Edite a pessoa antes de ativar.`);
        return;
      }
      const nowIso = new Date().toISOString();
      const prev = pessoas.find((p) => p.id === id);
      if (prev) upsertPessoa({ ...prev, invited_at: nowIso });
      const { error } = await sb.from('pessoas').update({ invited_at: nowIso }).eq('id', id);
      if (error) {
        if (prev) upsertPessoa(prev);
        toast.error('Erro ao ativar: ' + error.message);
        return;
      }
      toast.success(`${nome} ativada. Já pode entrar com Google.`);
    },
    [pessoas, sb, toast, upsertPessoa],
  );

  // Revoga acesso: zera invited_at. Sessão ativa expira no próximo
  // refresh do browser (não fazemos kill remoto — não temos service-role
  // no client).
  const runDesativarPessoa = useCallback(
    async (id: string, nome: string) => {
      if (!confirm(`Revogar acesso de ${nome}? A sessão ativa expira no próximo refresh do browser dele.`)) return;
      const prev = pessoas.find((p) => p.id === id);
      if (prev) upsertPessoa({ ...prev, invited_at: null });
      const { error } = await sb.from('pessoas').update({ invited_at: null }).eq('id', id);
      if (error) {
        if (prev) upsertPessoa(prev);
        toast.error('Erro ao revogar: ' + error.message);
        return;
      }
      toast.success(`Acesso de ${nome} revogado.`);
    },
    [pessoas, sb, toast, upsertPessoa],
  );

  const runDeletePessoa = (id: string, nome: string) => {
    const tcount = tasksByPessoa.get(id) ?? 0;
    if (tcount) {
      toast.error(`Não é possível excluir: existem ${tcount} tarefa(s) atribuídas.`);
      return;
    }
    if (!confirm(`Excluir "${nome}"?`)) return;
    startTransition(async () => {
      const { error } = await sb.from('pessoas').delete().eq('id', id);
      if (error) {
        toast.error(error.message);
        return;
      }
      removePessoa(id);
    });
  };

  if (loading) return <div className="text-muted text-sm">Carregando…</div>;
  if (error) return <div className="text-[color:var(--danger)] text-sm">Erro: {error}</div>;

  const clientesVisiveis = showArquivados ? clientes : clientesAtivos;
  const projetosVisiveis = showArquivados ? projetos : projetosAtivos;

  return (
    <div className="space-y-5">
      {/* Page bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted">
          <strong className="text-ink">{clientesAtivos.length}</strong> clientes ·{' '}
          <strong className="text-ink">{projetosAtivos.length}</strong> projetos ·{' '}
          <strong className="text-ink">{pessoas.length}</strong> pessoas
          {tab === 'clientes' && clientesSemDominio.length > 0 && (
            <span className="ml-2 font-mono text-[11px] text-amber-700">
              · <strong>{clientesSemDominio.length}</strong> sem domínio
            </span>
          )}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border border-line overflow-hidden text-sm">
            {(['clientes', 'projetos', 'pessoas'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1.5 capitalize transition-colors',
                  tab === t
                    ? 'bg-brand-tint font-semibold text-brand-dark'
                    : 'text-ink-soft hover:bg-brand-tint',
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowArquivados((v) => !v)}
            disabled={tab === 'pessoas'}
            title={tab === 'pessoas' ? 'Pessoas não têm flag de arquivado.' : undefined}
            className={cn(
              'text-xs px-2 py-1.5 rounded border transition-colors',
              tab === 'pessoas'
                ? 'border-line text-muted opacity-40 cursor-not-allowed'
                : showArquivados
                  ? 'border-brand text-brand-dark bg-brand-tint'
                  : 'border-line text-muted hover:border-line-strong',
            )}
          >
            arquivados
          </button>

          {tab === 'clientes' && <NewClienteButton />}
          {tab === 'projetos' && <NewProjetoButton clientes={clienteOptions} />}
          {tab === 'pessoas' && <NewPessoaButton clientes={clienteOptions} />}
        </div>
      </div>

      {/* Clientes */}
      {tab === 'clientes' && (
        <div className="rounded-xl border border-line bg-bg-elev divide-y divide-line">
          {clientesVisiveis.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between gap-3 flex-wrap px-4 py-3',
                c.arquivadoEm && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-md bg-brand-soft flex items-center justify-center text-sm font-bold text-brand shrink-0">
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
                    <span>{c.nome}</span>
                    <Chip show={c.tier === 'estrategico'} label="estratégico" className="bg-brand-soft text-brand-dark" />
                    <Chip show={c.tier === 'potencial'} label="potencial" className="bg-yellow-50 text-yellow-700 border border-yellow-200" />
                    <Chip show={c.tier === 'descoberta'} label="descoberta" className="bg-bg-elev text-muted border border-line" />
                    <Chip show={!!c.arquivadoEm} label="arquivado" className="bg-bg-elev text-muted border border-line" />
                    <Chip show={c.ehInterno} label="interno" className="bg-slate-100 text-slate-600" />
                    {!c.ehInterno && !c.arquivadoEm && (!c.dominios || c.dominios.length === 0) && (
                      <span className="chip border border-yellow-300 bg-yellow-50 text-amber-700">
                        sem domínio
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {tasksByCliente.get(c.id) ?? 0} tarefas · {projetosByCliente.get(c.id) ?? 0} projetos
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {!c.arquivadoEm && !c.ehInterno && (
                  <button type="button" className="btn-ghost-sm" onClick={() => runArquivarCliente(c.id)}>
                    arquivar
                  </button>
                )}
                {c.arquivadoEm && (
                  <button type="button" className="btn-ghost-sm" onClick={() => runDesarquivarCliente(c.id)}>
                    desarquivar
                  </button>
                )}
                <EditClienteButton
                  cliente={{
                    id: c.id,
                    nome: c.nome,
                    tier: c.tier,
                    ehInterno: c.ehInterno,
                    dominios: c.dominios,
                  }}
                />
                {!c.ehInterno && isAdmin && (
                  <button
                    type="button"
                    className="btn-ghost-sm text-[color:var(--danger)]"
                    onClick={() => runDeleteCliente(c.id, c.nome)}
                    title="Excluir cliente"
                  >
                    excluir
                  </button>
                )}
              </div>
            </div>
          ))}
          {clientesVisiveis.length === 0 && <EmptyState label="Nenhum cliente cadastrado." />}
        </div>
      )}

      {/* Projetos */}
      {tab === 'projetos' && (
        <div className="rounded-xl border border-line bg-bg-elev divide-y divide-line">
          {projetosVisiveis.map((p) => {
            const clienteNome = clientes.find((c) => c.id === p.clienteId)?.nome ?? '—';
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center justify-between gap-3 flex-wrap px-4 py-3',
                  p.arquivadoEm && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
                    <span>{p.nome}</span>
                    <Chip show={!!p.tipo} label={p.tipo || ''} className="bg-bg-elev text-muted border border-line" />
                    {p.slaEntregaDias != null && (
                      <Chip show label={`SLA ${p.slaEntregaDias}d`} className="bg-bg-elev text-muted border border-line" />
                    )}
                    {p.orcamentoHoras != null && (
                      <Chip show label={`${p.orcamentoHoras}h`} className="bg-bg-elev text-muted border border-line" />
                    )}
                    <Chip show={!!p.arquivadoEm} label="arquivado" className="bg-bg-elev text-muted border border-line" />
                  </div>
                  <p className="text-xs text-muted">
                    {clienteNome} · {tasksByProjeto.get(p.id) ?? 0} tarefas
                  </p>
                </div>
                <div className="flex gap-1">
                  {!p.arquivadoEm && (
                    <button type="button" className="btn-ghost-sm" onClick={() => runArquivarProjeto(p.id)}>
                      arquivar
                    </button>
                  )}
                  {p.arquivadoEm && (
                    <button type="button" className="btn-ghost-sm" onClick={() => runDesarquivarProjeto(p.id)}>
                      desarquivar
                    </button>
                  )}
                  <EditProjetoButton
                    projeto={{
                      id: p.id,
                      nome: p.nome,
                      clienteId: p.clienteId,
                      tipo: p.tipo,
                      slaRespostaHoras: p.slaRespostaHoras,
                      slaEntregaDias: p.slaEntregaDias,
                      orcamentoHoras: p.orcamentoHoras,
                    }}
                    clientes={clienteOptions}
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn-ghost-sm text-[color:var(--danger)]"
                      onClick={() => runDeleteProjeto(p.id, p.nome)}
                      title="Excluir projeto"
                    >
                      excluir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {projetosVisiveis.length === 0 && <EmptyState label="Nenhum projeto cadastrado." />}
        </div>
      )}

      {/* Pessoas */}
      {tab === 'pessoas' && (
        <div className="rounded-xl border border-line bg-bg-elev divide-y divide-line">
          {pessoas.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 flex-wrap px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-brand-soft flex items-center justify-center text-sm font-bold text-brand shrink-0">
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium">
                    <span>{p.nome}</span>
                    <Chip show={p.role === 'admin'} label="admin" className="bg-brand-soft text-brand-dark" />
                    <Chip show={p.role === 'cliente'} label="cliente externo" className="bg-yellow-50 text-yellow-700 border border-yellow-200" />
                    {p.senioridade && p.role !== 'cliente' && (
                      <Chip show label={p.senioridade} className="bg-bg-elev text-muted border border-line" />
                    )}
                    <Chip show={!!p.invited_at && !!p.user_id} label="acesso ativo" className="bg-brand-soft text-brand-dark" />
                    <Chip show={!!p.invited_at && !p.user_id} label="aguardando 1º login" className="bg-yellow-50 text-yellow-700 border border-yellow-200" />
                    <Chip show={!p.invited_at && !!p.email} label="inativa" className="bg-bg-elev text-muted border border-line" />
                  </div>
                  <p className="text-xs text-muted font-mono truncate">{p.email ?? '—'}</p>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {isAdmin && p.role === 'cliente' && !p.invited_at && (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => runConvidarPessoa(p.id, p.nome, p.email)}
                    title="Enviar magic link de acesso ao Portal"
                  >
                    convidar
                  </button>
                )}
                {isAdmin && p.role === 'cliente' && !!p.invited_at && (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => runConvidarPessoa(p.id, p.nome, p.email)}
                    title="Reenviar magic link"
                  >
                    reenviar
                  </button>
                )}
                {isAdmin && p.role !== 'cliente' && !p.invited_at && (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    onClick={() => runAtivarPessoa(p.id, p.nome, p.email)}
                    title="Liberar acesso (login via Google)"
                  >
                    ativar
                  </button>
                )}
                {isAdmin && !!p.invited_at && (
                  <button
                    type="button"
                    className="btn-ghost-sm text-[color:var(--muted)]"
                    onClick={() => runDesativarPessoa(p.id, p.nome)}
                    title="Revogar acesso"
                  >
                    inativar
                  </button>
                )}
                <EditPessoaButton
                  pessoa={{
                    id: p.id,
                    nome: p.nome,
                    email: p.email,
                    role: p.role,
                    clienteId: p.cliente_id,
                    clientePrincipalId: p.cliente_principal_id,
                    clienteSecundarioId: p.cliente_secundario_id,
                    capacidadeHorasSemana: p.capacidade_horas_semana,
                    skills: p.skills ?? [],
                    senioridade: p.senioridade,
                  }}
                  clientes={clienteOptions}
                />
                {isAdmin && (
                  <button
                    type="button"
                    className="btn-ghost-sm text-[color:var(--danger)]"
                    onClick={() => runDeletePessoa(p.id, p.nome)}
                    title="Excluir pessoa"
                  >
                    excluir
                  </button>
                )}
              </div>
            </div>
          ))}
          {pessoas.length === 0 && <EmptyState label="Nenhuma pessoa cadastrada." />}
        </div>
      )}
    </div>
  );
}

function Chip({ show, label, className }: { show: boolean; label: string; className: string }) {
  if (!show) return null;
  return <span className={cn('chip', className)}>{label}</span>;
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm italic text-muted">{label}</p>;
}
