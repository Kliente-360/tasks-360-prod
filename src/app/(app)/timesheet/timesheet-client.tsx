'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData, useTasksById, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { fmtDuration, useTimer } from '@/lib/use-timer';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import { atrasada } from '@/lib/task-utils';
import type { Filters as StdFilters } from '@/lib/filters';
import { getSharedFilters, patchSharedFilters, clearSharedFilters } from '@/lib/shared-filters';

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function TimesheetClient() {
  const { currentPessoa, viewerRole, clientes, projetos, loading, timeEntries, removeTimeEntry } = useData();
  const { activeEntry, startTimer } = useTimer();
  const tasksById = useTasksById();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const { openEdit } = useTaskModal();

  const isAdmin = viewerRole === 'admin';
  const [qDraft, setQDraft] = useState('');
  const [filterCliente, setFilterCliente] = useState(() => getSharedFilters().cliente);
  const [filterProjeto, setFilterProjeto] = useState(() => getSharedFilters().projeto);
  const [filterPessoaId, setFilterPessoaId] = useState(() => getSharedFilters().pessoa);
  const [filterPrazo, setFilterPrazo] = useState<'' | 'atrasadas' | 'hoje' | 'semana' | 'sem'>(() => getSharedFilters().prazo);
  useEffect(() => {
    patchSharedFilters({
      cliente: filterCliente,
      projeto: filterProjeto,
      pessoa: filterPessoaId,
      prazo: filterPrazo,
    });
  }, [filterCliente, filterProjeto, filterPessoaId, filterPrazo]);
  const [groupBy, setGroupBy] = useState<'' | 'resp' | 'cli' | 'status'>('');

  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const projetosFiltrados = useMemo(
    () => projetos.filter((p) => !p.arquivadoEm && (!filterCliente || p.clienteId === filterCliente)),
    [projetos, filterCliente],
  );

  // Filtra entries cruzando com a task vinculada (que tem cliente/projeto/prazo).
  const entries = useMemo(() => {
    if (!currentPessoa) return [];
    const q = qDraft.trim().toLowerCase();
    const todayIso = new Date().toISOString().slice(0, 10);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Iso = in7.toISOString().slice(0, 10);
    return timeEntries.filter((e) => {
      // Não-admin sempre vê só os próprios
      if (!isAdmin && e.pessoaId !== currentPessoa.id) return false;
      // Filtro de pessoa (admin)
      if (filterPessoaId && e.pessoaId !== filterPessoaId) return false;
      // Filtros vinculados à task (cliente/projeto/prazo/busca)
      const t = tasksById.get(e.taskId);
      if (filterCliente && t?.clienteId !== filterCliente) return false;
      if (filterProjeto && t?.projetoId !== filterProjeto) return false;
      if (filterPrazo && t) {
        if (filterPrazo === 'atrasadas' && !atrasada(t)) return false;
        if (filterPrazo === 'hoje' && t.prazo !== todayIso) return false;
        if (filterPrazo === 'sem' && t.prazo) return false;
        if (filterPrazo === 'semana') {
          if (!t.prazo || t.prazo < todayIso || t.prazo > in7Iso) return false;
        }
      }
      if (q) {
        const taskTitle = t?.titulo ?? '';
        const cliNome = t ? (clientesById.get(t.clienteId)?.nome ?? '') : '';
        const projNome = t ? (projetosById.get(t.projetoId)?.nome ?? '') : '';
        const pessNome = pessoasById.get(e.pessoaId)?.nome ?? '';
        const hay = [taskTitle, cliNome, projNome, pessNome, e.note ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [timeEntries, currentPessoa, isAdmin, filterPessoaId, filterCliente, filterProjeto, filterPrazo, qDraft, tasksById, clientesById, projetosById, pessoasById]);

  // Agrupamento (quando groupBy != '')
  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, { label: string; items: typeof entries; totalMs: number }>();
    for (const e of entries) {
      const t = tasksById.get(e.taskId);
      let key: string;
      let label: string;
      if (groupBy === 'resp') {
        key = e.pessoaId;
        label = pessoasById.get(e.pessoaId)?.nome ?? '—';
      } else if (groupBy === 'cli') {
        key = t?.clienteId ?? '__';
        label = t ? (clientesById.get(t.clienteId)?.nome ?? '—') : '—';
      } else {
        // groupBy === 'status' — agrupa pelo status da task vinculada
        key = t?.status ?? '__sem_task__';
        const STATUS_LABEL: Record<string, string> = {
          backlog: 'Backlog',
          andamento: 'Em andamento',
          bloqueado: 'Bloqueado',
          concluido: 'Concluído',
          __sem_task__: '(task removida)',
        };
        label = STATUS_LABEL[key] ?? key;
      }
      const cur = groups.get(key) ?? { label, items: [], totalMs: 0 };
      cur.items.push(e);
      cur.totalMs += (e.endedAt ?? Date.now()) - e.startedAt;
      groups.set(key, cur);
    }
    return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs);
  }, [groupBy, entries, tasksById, clientesById, pessoasById]);

  async function deleteEntry(id: string) {
    const supabase = createClient();
    await supabase.from('time_entries').delete().eq('id', id);
    removeTimeEntry(id);
  }

  const totalMs = useMemo(
    () =>
      entries.reduce((acc, e) => {
        if (!e.endedAt) return acc + (Date.now() - e.startedAt);
        return acc + (e.endedAt - e.startedAt);
      }, 0),
    [entries],
  );

  const staffPessoas = useMemo(
    () => [...pessoasById.values()]
      .filter((p) => p.role === 'admin' || p.role === 'interno')
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [pessoasById],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-muted text-sm">carregando…</span>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Timesheet"
        right={
          <FilterBar
            f={{
              q: qDraft,
              cliente: filterCliente,
              projeto: filterProjeto,
              resp: filterPessoaId,
              prazo: filterPrazo,
            } satisfies StdFilters}
            set={(key, value) => {
              if (key === 'q') setQDraft(value);
              else if (key === 'cliente') { setFilterCliente(value); setFilterProjeto(''); }
              else if (key === 'projeto') setFilterProjeto(value);
              else if (key === 'resp') setFilterPessoaId(value);
              else if (key === 'prazo') setFilterPrazo(value as typeof filterPrazo);
            }}
            onClear={() => {
              setQDraft('');
              setFilterCliente('');
              setFilterProjeto('');
              setFilterPessoaId('');
              setFilterPrazo('');
              setGroupBy('');
              clearSharedFilters();
            }}
            clienteOptions={clientesAtivos.map((c) => ({ v: c.id, label: c.nome }))}
            projetoOptions={projetosFiltrados.map((p) => ({ v: p.id, label: p.nome }))}
            pessoaOptions={staffPessoas.map((p) => ({ v: p.id, label: p.nome }))}
            // Não-admin não filtra por responsável (sempre vê só os próprios registros)
            show={isAdmin ? ['cliente', 'projeto', 'resp', 'prazo'] : ['cliente', 'projeto', 'prazo']}
            moreItems={[
              { key: 'group-resp', label: groupBy === 'resp' ? 'Agrupando: Responsável ✓' : 'Agrupar: Responsável', kind: 'action', icon: 'users', enabled: isAdmin, onClick: () => setGroupBy(groupBy === 'resp' ? '' : 'resp') },
              { key: 'group-cli', label: groupBy === 'cli' ? 'Agrupando: Cliente ✓' : 'Agrupar: Cliente', kind: 'action', icon: 'building', onClick: () => setGroupBy(groupBy === 'cli' ? '' : 'cli') },
              { key: 'group-status', label: groupBy === 'status' ? 'Agrupando: Status ✓' : 'Agrupar: Status', kind: 'action', icon: 'list-filter', onClick: () => setGroupBy(groupBy === 'status' ? '' : 'status') },
              { key: 'div1', label: '---' },
              { key: 'arquivadas', label: 'Mostrar arquivadas', enabled: false, kind: 'toggle' },
              { key: 'ia', label: 'Somente criadas por IA', enabled: false, kind: 'toggle' },
              { key: 'humano', label: 'Somente criadas por humanos', enabled: false, kind: 'toggle' },
            ] satisfies MoreMenuItem[]}
          />
        }
      />

      {/* Summary card */}
      <div className="card p-4 mb-6 flex items-center gap-6">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide">Total</div>
          <div className="text-2xl font-mono font-semibold text-brand">{fmtDuration(totalMs)}</div>
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide">Registros</div>
          <div className="text-2xl font-mono font-semibold">{entries.length}</div>
        </div>
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">Nenhum registro encontrado.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-medium">Data</th>
                <th className="text-left px-4 py-2.5 font-medium">Tarefa</th>
                {isAdmin && !filterPessoaId && (
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Pessoa</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Início</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Fim</th>
                <th className="text-right px-4 py-2.5 font-medium">Duração</th>
                <th className="w-8 px-2" />
              </tr>
            </thead>
            <tbody>
              {(grouped ?? [{ label: '', items: entries, totalMs }]).map((group) => (
                <Fragment key={group.label || '__all__'}>
                  {grouped && (
                    <tr className="bg-[var(--bg-alt)] border-b border-line-strong">
                      <td colSpan={isAdmin && !filterPessoaId ? 7 : 6} className="px-4 py-1.5">
                        <span className="font-semibold text-sm text-ink">{group.label}</span>
                        <span className="ml-3 text-xs text-muted font-mono">
                          {fmtDuration(group.totalMs)} · {group.items.length} registro{group.items.length !== 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>
                  )}
                  {group.items.map((e) => {
                    const task = tasksById.get(e.taskId);
                    const pessoa = pessoasById.get(e.pessoaId);
                    const durMs = e.endedAt ? e.endedAt - e.startedAt : Date.now() - e.startedAt;
                    const isRunning = !e.endedAt;
                    const canDel = viewerRole === 'admin' || e.pessoaId === currentPessoa?.id;
                    return (
                      <tr key={e.id} className="border-b border-line last:border-0 hover:bg-[var(--surface-3)] transition-colors">
                        <td className="px-4 py-2.5 text-muted font-mono text-xs">{fmtDateTime(e.startedAt)}</td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          {task ? (
                            <button
                              type="button"
                              className="text-left hover:text-brand hover:underline truncate max-w-full block"
                              onClick={() => openEdit(e.taskId)}
                            >
                              {task.titulo}
                            </button>
                          ) : (
                            <span className="text-muted">{e.taskId.slice(0, 8)}…</span>
                          )}
                          {e.note && (
                            <span className="text-xs text-muted italic block truncate max-w-[180px]">{e.note}</span>
                          )}
                        </td>
                        {isAdmin && !filterPessoaId && (
                          <td className="px-4 py-2.5 text-muted hidden md:table-cell">{pessoa?.nome ?? '—'}</td>
                        )}
                        <td className="px-4 py-2.5 font-mono text-xs text-muted hidden sm:table-cell">{fmtTime(e.startedAt)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted hidden sm:table-cell">
                          {e.endedAt ? fmtTime(e.endedAt) : (
                            <span className="text-[color:var(--brand)]">em andamento</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono font-medium ${isRunning ? 'text-[color:var(--brand)]' : ''}`}>
                          {fmtDuration(durMs)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {canDel && !isRunning && (
                            <button
                              type="button"
                              className="text-muted hover:text-danger text-base leading-none"
                              onClick={() => deleteEntry(e.id)}
                              title="Excluir registro"
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
