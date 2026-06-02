'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData, useTasksById, usePessoasById } from '@/lib/data-store';
import { fmtDuration, useTimer } from '@/lib/use-timer';
import { useTaskModal } from '@/components/task-modal';
import { PageHeader } from '@/components/page-header';
import { FilterBar, type MoreMenuItem } from '@/components/filter-bar';
import type { Filters as StdFilters } from '@/lib/filters';

function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ms: number) {
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function TimesheetClient() {
  const { currentPessoa, viewerRole, loading, timeEntries, removeTimeEntry } = useData();
  const { activeEntry, startTimer } = useTimer();
  const tasksById = useTasksById();
  const pessoasById = usePessoasById();
  const { openEdit } = useTaskModal();

  const isAdmin = viewerRole === 'admin';
  const [onlyMine, setOnlyMine] = useState(false);
  const [filterPessoaId, setFilterPessoaId] = useState('');

  // Filtra in-memory (sem fetch). timeEntries vem do DataProvider, já
  // populado no boot. Render instantâneo igual às outras abas.
  const entries = useMemo(() => {
    if (!currentPessoa) return [];
    if (!isAdmin || onlyMine) {
      return timeEntries.filter((e) => e.pessoaId === currentPessoa.id);
    }
    if (filterPessoaId) {
      return timeEntries.filter((e) => e.pessoaId === filterPessoaId);
    }
    return timeEntries;
  }, [timeEntries, currentPessoa, isAdmin, onlyMine, filterPessoaId]);

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
    () => [...pessoasById.values()].filter((p) => p.role === 'admin' || p.role === 'interno'),
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
        context="Registros de tempo por tarefa"
        right={
          <FilterBar
            f={{
              q: '',
              cliente: '',
              projeto: '',
              resp: onlyMine ? (currentPessoa?.id ?? '') : filterPessoaId,
              prazo: '',
            } satisfies StdFilters}
            set={(key, value) => {
              if (key === 'resp') {
                if (value === (currentPessoa?.id ?? '')) {
                  setOnlyMine(true);
                  setFilterPessoaId('');
                } else {
                  setOnlyMine(false);
                  setFilterPessoaId(value);
                }
              }
            }}
            onClear={() => {
              setOnlyMine(false);
              setFilterPessoaId('');
            }}
            show={isAdmin ? ['resp'] : []}
            pessoaOptions={staffPessoas.map((p) => ({ v: p.id, label: p.nome }))}
            moreItems={[
              { key: 'group-resp', label: 'Agrupar: Responsável', enabled: false, kind: 'action', icon: 'users' },
              { key: 'group-cli', label: 'Agrupar: Cliente', enabled: false, kind: 'action', icon: 'building' },
              { key: 'group-status', label: 'Agrupar: Status', enabled: false, kind: 'action', icon: 'list-filter' },
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
                {isAdmin && !onlyMine && (
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Pessoa</th>
                )}
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Início</th>
                <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Fim</th>
                <th className="text-right px-4 py-2.5 font-medium">Duração</th>
                <th className="w-8 px-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
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
                    {isAdmin && !onlyMine && (
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
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
