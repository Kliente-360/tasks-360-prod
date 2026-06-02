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
  const clientesById = new Map(clientes.map((c) => [c.id, c] as const));

  return (
    <div>
      {/* PageHeader · contexto = stats agregadas · right = arquivados + botão criar contextual */}
      <PageHeader
        title="Cadastros"
        context={
          <>
            <b>{clientesAtivos.length}</b> clientes
            <span className="mx-1.5">·</span>
            <b>{projetosAtivos.length}</b> projetos
            <span className="mx-1.5">·</span>
            <b>{pessoas.length}</b> pessoas
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowArquivados((v) => !v)}
              disabled={tab === 'pessoas'}
              title={tab === 'pessoas' ? 'Pessoas não têm flag de arquivado.' : 'Mostrar arquivados'}
              className={cn(
                'iconbtn bordered text-xs',
                tab === 'pessoas' && 'opacity-40 cursor-not-allowed',
                showArquivados && tab !== 'pessoas' && 'bg-[color:var(--green-tint)] border-[color:var(--green)] text-[color:var(--green)]',
              )}
              style={{ width: 'auto', padding: '0 12px', gap: 6 }}
              aria-label="Mostrar arquivados"
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

      {/* Subabas · padrão DS com count badge */}
      <div className="subtabs" role="tablist" aria-label="Tipo de cadastro">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clientes'}
          className={cn('subtab', tab === 'clientes' && 'active')}
          onClick={() => setTab('clientes')}
        >
          <Icon name="building" size={14} />
          Clientes
          <span className="badge">{clientesAtivos.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'projetos'}
          className={cn('subtab', tab === 'projetos' && 'active')}
          onClick={() => setTab('projetos')}
        >
          <Icon name="folder" size={14} />
          Projetos
          <span className="badge">{projetosAtivos.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'pessoas'}
          className={cn('subtab', tab === 'pessoas' && 'active')}
          onClick={() => setTab('pessoas')}
        >
          <Icon name="users" size={14} />
          Pessoas
          <span className="badge">{pessoas.length}</span>
        </button>
      </div>

      {/* Aviso opcional: clientes sem domínio (preserva o sinal que estava antes) */}
      {tab === 'clientes' && clientesSemDominio.length > 0 && (
        <p className="mt-3 text-xs text-[color:var(--sig-amber-fg)]">
          <strong>{clientesSemDominio.length}</strong> cliente(s) sem domínio cadastrado — edite pra ativar matching automático de email.
        </p>
      )}

      <div className="mt-4 card overflow-hidden">
        {/* Wrapper de scroll horizontal — tabelas com 8 colunas podem
            estourar a max-width 1320px em laptops menores. */}
        <div className="overflow-x-auto">
        {/* ===== Clientes — colunas: Cliente · Tier · Domínios · Cor Portal · Cor Texto · Projetos · Tarefas · Ações ===== */}
        {tab === 'clientes' && (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th style={{ width: 130 }}>Tier</th>
                <th style={{ width: 200 }}>Domínios</th>
                <th style={{ width: 130 }}>Cor Portal</th>
                <th style={{ width: 110 }}>Cor Texto</th>
                <th style={{ width: 90, textAlign: 'right' }}>Projetos</th>
                <th style={{ width: 90, textAlign: 'right' }}>Tarefas</th>
                <th style={{ width: 160 }} className="actions">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {clientesVisiveis.map((c) => {
                const isInterno = c.ehInterno;
                return (
                  <tr key={c.id} className={cn(c.arquivadoEm && 'opacity-60')}>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar label={c.nome} shape="square" />
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-[color:var(--ink)]">{c.nome}</span>
                          <Chip show={!!c.arquivadoEm} label="arquivado" variant="muted" />
                          <Chip show={isInterno} label="interno" variant="muted" />
                        </div>
                      </div>
                    </td>
                    <td><TierChip tier={c.tier} /></td>
                    <td className="text-[color:var(--ink-soft)]">
                      <DominiosCell list={c.dominios} />
                    </td>
                    <td><CorSwatch hex={c.corPortal} /></td>
                    <td className="text-[color:var(--ink-soft)]">
                      {c.corPortalTexto ? (c.corPortalTexto === 'light' ? 'Claro' : 'Escuro') : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{projetosByCliente.get(c.id) ?? 0}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{tasksByCliente.get(c.id) ?? 0}</td>
                    <td className="actions">
                      {/* Arquivar/Desarquivar · interno mostra mas desabilita */}
                      {!c.arquivadoEm ? (
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => !isInterno && runArquivarCliente(c.id)}
                          disabled={isInterno}
                          title={isInterno ? 'Kliente 360 (interno) não pode ser arquivado' : 'Arquivar cliente'}
                          aria-label="Arquivar cliente"
                        >
                          <Icon name="archive" size={14} />
                        </button>
                      ) : (
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
                      {isAdmin && (
                        <button
                          type="button"
                          className="iconbtn"
                          style={{ color: isInterno ? 'var(--muted)' : 'var(--danger)' }}
                          onClick={() => !isInterno && runDeleteCliente(c.id, c.nome)}
                          disabled={isInterno}
                          title={isInterno ? 'Kliente 360 (interno) não pode ser excluído' : 'Excluir cliente'}
                          aria-label="Excluir cliente"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {clientesVisiveis.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState label="Nenhum cliente cadastrado." icon="building" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* ===== Projetos — colunas: Projeto · Cliente · Tipo · SLA Resp · SLA Entrega · Orçamento · Tarefas · Ações ===== */}
        {tab === 'projetos' && (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th style={{ width: 180 }}>Cliente</th>
                <th style={{ width: 120 }}>Tipo</th>
                <th style={{ width: 110, textAlign: 'right' }}>SLA Resp</th>
                <th style={{ width: 110, textAlign: 'right' }}>SLA Entrega</th>
                <th style={{ width: 110, textAlign: 'right' }}>Orçamento</th>
                <th style={{ width: 90, textAlign: 'right' }}>Tarefas</th>
                <th style={{ width: 160 }} className="actions">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {projetosVisiveis.map((p) => {
                const clienteNome = clientesById.get(p.clienteId)?.nome ?? '—';
                return (
                  <tr key={p.id} className={cn(p.arquivadoEm && 'opacity-60')}>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: 'var(--surface-3)', color: 'var(--ink-soft)' }}
                        >
                          <Icon name="folder" size={16} />
                        </span>
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-[color:var(--ink)]">{p.nome}</span>
                          <Chip show={!!p.arquivadoEm} label="arquivado" variant="muted" />
                        </div>
                      </div>
                    </td>
                    <td className="text-[color:var(--ink-soft)]">{clienteNome}</td>
                    <td className="text-[color:var(--ink-soft)]">
                      {p.tipo ? (p.tipo.charAt(0).toUpperCase() + p.tipo.slice(1)) : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {p.slaRespostaHoras != null ? `${p.slaRespostaHoras}h` : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {p.slaEntregaDias != null ? `${p.slaEntregaDias}d` : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {p.orcamentoHoras != null ? `${p.orcamentoHoras}h` : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>{tasksByProjeto.get(p.id) ?? 0}</td>
                    <td className="actions">
                      {!p.arquivadoEm ? (
                        <button
                          type="button"
                          className="iconbtn"
                          onClick={() => runArquivarProjeto(p.id)}
                          title="Arquivar projeto"
                          aria-label="Arquivar projeto"
                        >
                          <Icon name="archive" size={14} />
                        </button>
                      ) : (
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
                    </td>
                  </tr>
                );
              })}
              {projetosVisiveis.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState label="Nenhum projeto cadastrado." icon="folder" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* ===== Pessoas — colunas: Nome · Email · Papel · Cliente Principal · Cliente Secundário · Senioridade · Capacidade · Ações ===== */}
        {tab === 'pessoas' && (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th style={{ width: 220 }}>Email</th>
                <th style={{ width: 130 }}>Papel</th>
                <th style={{ width: 160 }}>Cliente Principal</th>
                <th style={{ width: 160 }}>Cliente Secundário</th>
                <th style={{ width: 120 }}>Senioridade</th>
                <th style={{ width: 110, textAlign: 'right' }}>Capacidade</th>
                <th style={{ width: 200 }} className="actions">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => {
                const papelLabel =
                  p.role === 'cliente' ? 'Cliente externo' :
                  p.role === 'admin' ? 'Admin' :
                  'Interno';
                const principalNome = p.cliente_principal_id
                  ? (clientes.find((c) => c.id === p.cliente_principal_id)?.nome ?? '—')
                  : null;
                const secundarioNome = p.cliente_secundario_id
                  ? (clientes.find((c) => c.id === p.cliente_secundario_id)?.nome ?? '—')
                  : null;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar label={p.nome} shape="circle" />
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-[color:var(--ink)]">{p.nome}</span>
                          <Chip show={!!p.invited_at && !!p.user_id} label="ativo" variant="green" />
                          <Chip show={!!p.invited_at && !p.user_id} label="aguardando" variant="warning" />
                          <Chip show={!p.invited_at && !!p.email} label="inativa" variant="muted" />
                        </div>
                      </div>
                    </td>
                    <td className="text-[color:var(--ink-soft)] font-mono text-xs truncate" style={{ maxWidth: 220 }}>
                      {p.email || <span className="text-muted">—</span>}
                    </td>
                    <td className="text-[color:var(--ink-soft)]">
                      {p.role === 'admin' ? (
                        <Chip show label="Admin" variant="green" />
                      ) : (
                        papelLabel
                      )}
                    </td>
                    <td className="text-[color:var(--ink-soft)] truncate" style={{ maxWidth: 160 }}>
                      {principalNome ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="text-[color:var(--ink-soft)] truncate" style={{ maxWidth: 160 }}>
                      {secundarioNome ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="text-[color:var(--ink-soft)]">
                      {p.senioridade
                        ? p.senioridade.charAt(0).toUpperCase() + p.senioridade.slice(1)
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {p.capacidade_horas_semana != null ? `${p.capacidade_horas_semana}h/sem` : <span className="text-muted">—</span>}
                    </td>
                    <td className="actions">
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
                    </td>
                  </tr>
                );
              })}
              {pessoas.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState label="Nenhuma pessoa cadastrada." icon="users" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}

/** Avatar com iniciais (1-2 letras), quadrado pra clientes e redondo pra pessoas. */
function Avatar({ label, shape }: { label: string; shape: 'square' | 'circle' }) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <span
      className={cn(
        'w-8 h-8 flex items-center justify-center text-[11px] font-semibold shrink-0 tracking-wide',
        shape === 'square' ? 'rounded-md' : 'rounded-full',
      )}
      style={{ background: 'var(--surface-3)', color: 'var(--ink-soft)' }}
      aria-hidden
    >
      {initials || '?'}
    </span>
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

/** Chip de Tier · cor segue o código semântico (verde/amarelo/cinza). */
function TierChip({ tier }: { tier: string | null | undefined }) {
  if (!tier) return <span className="text-muted text-xs">—</span>;
  if (tier === 'estrategico') return <Chip show label="Estratégico" variant="green" />;
  if (tier === 'potencial') return <Chip show label="Potencial" variant="warning" />;
  if (tier === 'descoberta') return <Chip show label="Descoberta" variant="muted" />;
  return <Chip show label={tier} variant="muted" />;
}

/** Swatch de cor — quadradinho colorido + valor hex em mono. */
function CorSwatch({ hex }: { hex: string | null | undefined }) {
  if (!hex) return <span className="text-muted text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block shrink-0 rounded"
        style={{ width: 18, height: 18, background: hex, border: '1px solid var(--line)' }}
        aria-hidden
      />
      <span className="font-mono text-xs text-[color:var(--ink-soft)]">{hex.toUpperCase()}</span>
    </span>
  );
}

/** Lista de domínios — exibe os 2 primeiros, "+N" se sobrar mais. */
function DominiosCell({ list }: { list: string[] | null | undefined }) {
  if (!list || list.length === 0) return <span className="text-muted text-xs">—</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap font-mono text-xs">
      {shown.map((d) => (
        <span key={d} className="text-[color:var(--ink-soft)]">{d}</span>
      ))}
      {rest > 0 && (
        <span className="text-muted" title={list.slice(2).join(', ')}>+{rest}</span>
      )}
    </span>
  );
}
