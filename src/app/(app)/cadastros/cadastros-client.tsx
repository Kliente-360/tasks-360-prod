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

import type { CSSProperties } from 'react';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useData } from '@/lib/data-store';
import { useToast } from '@/components/toast';
import { PageHeader } from '@/components/page-header';
import { Icon } from '@/components/icons';
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
      {/* PageHeader · padrão DS · toggle das 3 abas no titleAside · ações no right */}
      <PageHeader
        title="Cadastros"
        titleAside={
          <div className="view-toggle ml-2" role="tablist" aria-label="Tipo de cadastro">
            {(['clientes', 'projetos', 'pessoas'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArquivados((v) => !v)}
              disabled={tab === 'pessoas'}
              title={tab === 'pessoas' ? 'Pessoas não têm flag de arquivado.' : undefined}
              className={cn(
                'iconbtn bordered text-xs',
                tab === 'pessoas' && 'opacity-40 cursor-not-allowed',
                showArquivados && tab !== 'pessoas' && 'bg-[color:var(--green-tint)] border-[color:var(--green)] text-[color:var(--green)]',
              )}
              style={{ width: 'auto', padding: '0 12px', gap: 6 }}
            >
              <Icon name={showArquivados ? 'eye' : 'eye-off'} size={14} />
              Arquivados
            </button>

            {tab === 'clientes' && <NewClienteButton />}
            {tab === 'projetos' && <NewProjetoButton clientes={clienteOptions} />}
            {tab === 'pessoas' && <NewPessoaButton clientes={clienteOptions} />}
          </div>
        }
      />

      {/* Clientes */}
      {tab === 'clientes' && (
        <div className="card divide-y divide-[color:var(--line)] overflow-hidden">
          {clientesVisiveis.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex items-center justify-between gap-3 flex-wrap px-3 md:px-4 py-3 md:py-4 transition-colors hover:bg-[color:var(--surface-3)]',
                c.arquivadoEm && 'opacity-60',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
                >
                  {c.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium text-[color:var(--ink)]">
                    <span>{c.nome}</span>
                    <Chip show={c.tier === 'estrategico'} label="estratégico" variant="green" />
                    <Chip show={c.tier === 'potencial'} label="potencial" variant="warning" />
                    <Chip show={c.tier === 'descoberta'} label="descoberta" variant="muted" />
                    <Chip show={!!c.arquivadoEm} label="arquivado" variant="muted" />
                    <Chip show={c.ehInterno} label="interno" variant="muted" />
                    <Chip
                      show={!c.ehInterno && !c.arquivadoEm && (!c.dominios || c.dominios.length === 0)}
                      label="sem domínio"
                      variant="warning"
                    />
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {tasksByCliente.get(c.id) ?? 0} tarefas · {projetosByCliente.get(c.id) ?? 0} projetos
                  </p>
                </div>
              </div>
              <div className="flex gap-1 items-center">
                {!c.arquivadoEm && !c.ehInterno && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => runArquivarCliente(c.id)}
                    title="Arquivar cliente"
                    aria-label="Arquivar cliente"
                  >
                    <Icon name="archive" size={14} />
                  </button>
                )}
                {c.arquivadoEm && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => runDesarquivarCliente(c.id)}
                    title="Desarquivar cliente"
                    aria-label="Desarquivar cliente"
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                )}
                <EditClienteButton
                  cliente={{
                    id: c.id,
                    nome: c.nome,
                    tier: c.tier,
                    ehInterno: c.ehInterno,
                    dominios: c.dominios,
                    corPortal: c.corPortal,
                    corPortalTexto: c.corPortalTexto,
                  }}
                />
                {!c.ehInterno && isAdmin && (
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => runDeleteCliente(c.id, c.nome)}
                    title="Excluir cliente"
                    aria-label="Excluir cliente"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {clientesVisiveis.length === 0 && <EmptyState label="Nenhum cliente cadastrado." icon="building" />}
        </div>
      )}

      {/* Projetos */}
      {tab === 'projetos' && (
        <div className="card divide-y divide-[color:var(--line)] overflow-hidden">
          {projetosVisiveis.map((p) => {
            const clienteNome = clientes.find((c) => c.id === p.clienteId)?.nome ?? '—';
            return (
              <div
                key={p.id}
                className={cn(
                  'flex items-center justify-between gap-3 flex-wrap px-3 md:px-4 py-3 md:py-4 transition-colors hover:bg-[color:var(--surface-3)]',
                  p.arquivadoEm && 'opacity-60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium text-[color:var(--ink)]">
                    <span>{p.nome}</span>
                    <Chip show={!!p.tipo} label={p.tipo || ''} variant="muted" />
                    {p.slaEntregaDias != null && (
                      <Chip show label={`SLA ${p.slaEntregaDias}d`} variant="muted" />
                    )}
                    {p.orcamentoHoras != null && (
                      <Chip show label={`${p.orcamentoHoras}h`} variant="muted" />
                    )}
                    <Chip show={!!p.arquivadoEm} label="arquivado" variant="muted" />
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    {clienteNome} · {tasksByProjeto.get(p.id) ?? 0} tarefas
                  </p>
                </div>
                <div className="flex gap-1 items-center">
                  {!p.arquivadoEm && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => runArquivarProjeto(p.id)}
                      title="Arquivar projeto"
                      aria-label="Arquivar projeto"
                    >
                      <Icon name="archive" size={14} />
                    </button>
                  )}
                  {p.arquivadoEm && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => runDesarquivarProjeto(p.id)}
                      title="Desarquivar projeto"
                      aria-label="Desarquivar projeto"
                    >
                      <Icon name="refresh" size={14} />
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
                      className="iconbtn"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => runDeleteProjeto(p.id, p.nome)}
                      title="Excluir projeto"
                      aria-label="Excluir projeto"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {projetosVisiveis.length === 0 && <EmptyState label="Nenhum projeto cadastrado." icon="folder" />}
        </div>
      )}

      {/* Pessoas */}
      {tab === 'pessoas' && (
        <div className="card divide-y divide-[color:var(--line)] overflow-hidden">
          {pessoas.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 flex-wrap px-3 md:px-4 py-3 md:py-4 transition-colors hover:bg-[color:var(--surface-3)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
                >
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap text-sm font-medium text-[color:var(--ink)]">
                    <span>{p.nome}</span>
                    <Chip show={p.role === 'admin'} label="admin" variant="green" />
                    <Chip show={p.role === 'cliente'} label="cliente externo" variant="warning" />
                    {p.senioridade && p.role !== 'cliente' && (
                      <Chip show label={p.senioridade} variant="muted" />
                    )}
                    <Chip show={!!p.invited_at && !!p.user_id} label="acesso ativo" variant="green" />
                    <Chip show={!!p.invited_at && !p.user_id} label="aguardando 1º login" variant="warning" />
                    <Chip show={!p.invited_at && !!p.email} label="inativa" variant="muted" />
                  </div>
                  <p className="text-xs text-muted font-mono truncate mt-0.5">{p.email ?? '—'}</p>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end items-center">
                {isAdmin && p.role === 'cliente' && !p.invited_at && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => runConvidarPessoa(p.id, p.nome, p.email)}
                    title="Convidar (magic link de acesso ao Portal)"
                    aria-label="Convidar"
                  >
                    <Icon name="mention" size={14} />
                  </button>
                )}
                {isAdmin && p.role === 'cliente' && !!p.invited_at && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => runConvidarPessoa(p.id, p.nome, p.email)}
                    title="Reenviar magic link"
                    aria-label="Reenviar convite"
                  >
                    <Icon name="refresh" size={14} />
                  </button>
                )}
                {isAdmin && p.role !== 'cliente' && !p.invited_at && (
                  <button
                    type="button"
                    className="iconbtn"
                    style={{ color: 'var(--green)' }}
                    onClick={() => runAtivarPessoa(p.id, p.nome, p.email)}
                    title="Ativar (liberar login via Google)"
                    aria-label="Ativar pessoa"
                  >
                    <Icon name="check-circle" size={14} />
                  </button>
                )}
                {isAdmin && !!p.invited_at && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => runDesativarPessoa(p.id, p.nome)}
                    title="Revogar acesso"
                    aria-label="Inativar pessoa"
                  >
                    <Icon name="lock" size={14} />
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
                    className="iconbtn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => runDeletePessoa(p.id, p.nome)}
                    title="Excluir pessoa"
                    aria-label="Excluir pessoa"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {pessoas.length === 0 && <EmptyState label="Nenhuma pessoa cadastrada." icon="users" />}
        </div>
      )}
    </div>
  );
}

type ChipVariant = 'default' | 'green' | 'warning' | 'danger' | 'muted';

/**
 * Chip helper — todas as variantes via DS tokens, sem cores hardcoded
 * (compatível com dark mode).
 */
function Chip({
  show,
  label,
  variant = 'default',
}: {
  show: boolean;
  label: string;
  variant?: ChipVariant;
}) {
  if (!show) return null;
  const style = chipStyle(variant);
  return (
    <span className="chip" style={style}>
      {label}
    </span>
  );
}

function chipStyle(variant: ChipVariant): CSSProperties {
  switch (variant) {
    case 'green':
      return {
        background: 'var(--green-soft)',
        color: 'var(--green)',
        border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)',
      };
    case 'warning':
      return {
        background: 'color-mix(in srgb, var(--sig-amber) 12%, var(--surface-1))',
        color: 'var(--sig-amber-fg)',
        border: '1px solid color-mix(in srgb, var(--sig-amber) 35%, transparent)',
      };
    case 'danger':
      return {
        background: 'var(--danger-soft)',
        color: 'var(--danger)',
        border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
      };
    case 'muted':
      return {
        background: 'var(--bg-elev)',
        color: 'var(--muted)',
        border: '1px solid var(--line)',
      };
    case 'default':
    default:
      return {
        background: 'var(--surface-1)',
        color: 'var(--ink-soft)',
        border: '1px solid var(--line)',
      };
  }
}

function EmptyState({
  label,
  icon,
}: {
  label: string;
  icon?: 'building' | 'folder' | 'users';
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && (
        <span className="text-[color:var(--muted)]">
          <Icon name={icon} size={24} />
        </span>
      )}
      <p className="text-sm italic text-muted">{label}</p>
    </div>
  );
}
