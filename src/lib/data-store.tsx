'use client';

/**
 * Store de dados do app — equivalente em React do padrão Alpine:
 * boot carrega tasks+clientes+projetos+pessoas, realtime aplica delta
 * em tasks (e refetch debounced em clientes/projetos/pessoas), e
 * expõe helpers de mutação local + lookups (nomeCliente etc).
 *
 * Cada tela client (Backlog, Kanban, Modal…) consome via useData().
 * Uma única instância por sessão — Provider montado em (app)/layout.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from './supabase/client';
import { TASK_LIGHT_COLS, clienteFromDb, pessoaFromDb, projetoFromDb, taskFromDb, timeEntryFromDb } from './adapters';
import type { Cliente, Pessoa, Projeto, Task, TimeEntry } from './types';
import { useToastSafe } from '@/components/toast';

/** Janela de tasks concluídas trazidas no boot (resto vem sob demanda). */
const TASKS_CONCLUIDAS_WINDOW_DAYS = 60;
/** Janela de time_entries trazidas no boot (timesheet UI mostra 500 mais recentes). */
const TIME_ENTRIES_WINDOW_DAYS = 90;

export type RealtimeStatus = 'idle' | 'connecting' | 'subscribed' | 'error' | 'closed';

interface DataState {
  tasks: Task[];
  clientes: Cliente[];
  projetos: Projeto[];
  pessoas: Pessoa[];
  /** Time entries dos últimos N dias. Cronômetro start/stop e Timesheet
   *  consomem daqui (sem fetch local). RLS filtra por pessoa pra não-admin. */
  timeEntries: TimeEntry[];
  /** True só durante a primeira carga (boot). Pós-boot fica sempre false. */
  loading: boolean;
  /** True durante refetches manuais pós-boot — alimenta indicador "Atualizando…". */
  refreshing: boolean;
  error: string | null;
  realtimeStatus: RealtimeStatus;
  /** Pessoa logada (resolvida via session → pessoa.user_id ou email). */
  currentPessoa: Pessoa | null;
  /** Derivado de currentPessoa.role. Null enquanto não resolveu. */
  viewerRole: 'admin' | 'interno' | 'cliente' | null;
  /** Atalho pra currentPessoa.is_ceo. */
  isCEO: boolean;
}

interface DataActions {
  /** Refetch completo (botão "recarregar" / fallback). */
  refreshAll: () => Promise<void>;
  /** Mutações locais — escritas no banco continuam via supabase client direto. */
  patchTask: (id: string, changes: Partial<Task>) => Task | null;
  patchTasks: (ids: string[], changes: Partial<Task>) => void;
  replaceTask: (id: string, task: Task) => void;
  upsertTask: (task: Task) => void;
  removeTask: (id: string) => Task | null;
  removeTasks: (ids: string[]) => void;

  // Mutadores in-memory de clientes / projetos / pessoas (usados pelos
  // modais de Cadastros após server actions). Mantém a tela rápida — sem
  // round-trip de revalidatePath.
  upsertCliente: (c: Cliente) => void;
  removeCliente: (id: string) => void;
  upsertProjeto: (p: Projeto) => void;
  removeProjeto: (id: string) => void;
  upsertPessoa: (p: Pessoa) => void;
  removePessoa: (id: string) => void;

  // Mutators in-memory de time_entries (usados pelo TimerProvider e Timesheet).
  upsertTimeEntry: (e: TimeEntry) => void;
  removeTimeEntry: (id: string) => void;

  /** Registra que o usuário corrente acabou de salvar essa task. Usado
   *  pra escopar toasts de sync (só toasta o autor da edição, ignora
   *  ações de outros usuários no mesmo workspace). TTL ~30s. */
  markUserEditedTask: (id: string) => void;
}

type DataContextValue = DataState & DataActions;

const DataContext = createContext<DataContextValue | null>(null);

function cutoffIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - TASKS_CONCLUIDAS_WINDOW_DAYS);
  return d.toISOString();
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  // supabase é um singleton estável por sessão. createClient() do @supabase/ssr
  // já reaproveita conexão; manter ref evita re-criar a cada render.
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const toast = useToastSafe();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('idle');
  // currentPessoa hidrata do cache pra não piscar enquanto a query resolve.
  const [currentPessoa, setCurrentPessoa] = useState<Pessoa | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('kliente360-current-pessoa');
      return raw ? (JSON.parse(raw) as Pessoa) : null;
    } catch {
      return null;
    }
  });

  // Refs pros refetch debounced — coalescem rajadas de realtime numa única query.
  const refetchTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});

  // Watcher de transição de webhook_sync_status — toast GLOBAL (independe
  // de modal aberto). Pra clientes webhook_enabled (VB, CTF) o save fecha
  // o modal antes do webhook completar, então a única forma de informar
  // o usuário é via toast no nível da app.
  //
  // Escopo: toasta SÓ pra tasks que ESTE usuário editou recentemente
  // (Map<id, timestamp>, TTL 30s). Outros usuários do mesmo workspace
  // recebem o realtime mas NÃO veem toast — evita ruído.
  //
  // Estratégia: mantém um Map<task_id, last_sync_status> em ref. A cada
  // mudança em `tasks` (que vem do realtime), compara cada item com o
  // estado anterior. 1ª render só popula o baseline, sem toast.
  const syncStatusRef     = useRef<Map<string, string>>(new Map());
  const syncSeededRef     = useRef(false);
  const userEditedTasksRef = useRef<Map<string, number>>(new Map()); // task_id → epoch ms
  const USER_EDIT_TTL_MS  = 30_000;

  const markUserEditedTask = useCallback<DataActions['markUserEditedTask']>((id) => {
    if (!id) return;
    userEditedTasksRef.current.set(id, Date.now());
  }, []);

  useEffect(() => {
    const map = syncStatusRef.current;
    if (!syncSeededRef.current) {
      // 1ª render: só popula sem toastar (evita toasts no boot do app).
      for (const t of tasks) map.set(t.id, t.webhookSyncStatus ?? '');
      syncSeededRef.current = true;
      return;
    }
    const now = Date.now();
    const edits = userEditedTasksRef.current;
    // Limpa entradas vencidas (lazy purge — só quando rodar o watcher).
    for (const [id, ts] of edits) {
      if (now - ts > USER_EDIT_TTL_MS) edits.delete(id);
    }
    for (const t of tasks) {
      const cur = t.webhookSyncStatus ?? '';
      const prev = map.get(t.id);
      if (prev !== undefined && prev !== cur) {
        const isOwnEdit = edits.has(t.id);
        if (isOwnEdit) {
          if (cur === 'synced') {
            toast.success(`"${t.titulo}" sincronizada com Salesforce`);
          } else if (cur === 'error') {
            toast.error(`Falha ao sincronizar "${t.titulo}": ${t.webhookSyncError || 'erro desconhecido'}`);
          }
          // Edição já foi reconhecida — não toasta de novo se vier outra
          // transição na mesma task (ex: error → synced após retry SF).
          edits.delete(t.id);
        }
      }
      map.set(t.id, cur);
    }
  }, [tasks, toast]);

  const refreshTasks = useCallback(async () => {
    const cutoff = cutoffIso();
    const { data, error } = await sb
      .from('tasks')
      .select(TASK_LIGHT_COLS)
      .or(`status.neq.concluido,status_em.gte.${cutoff}`)
      .order('criado_em', { ascending: false });
    if (error) return;
    setTasks((data ?? []).map(taskFromDb));
  }, [sb]);

  const refreshClientes = useCallback(async () => {
    const { data, error } = await sb
      .from('clientes')
      .select('id,nome,tier,eh_interno,arquivado_em,dominios,webhook_enabled,cor_portal,cor_portal_texto')
      .order('nome');
    if (error) return;
    setClientes((data ?? []).map(clienteFromDb));
  }, [sb]);

  const refreshProjetos = useCallback(async () => {
    const { data, error } = await sb
      .from('projetos')
      .select('id,nome,cliente_id,sla_resposta_horas,sla_entrega_dias,orcamento_horas,tipo,arquivado_em')
      .order('nome');
    if (error) return;
    setProjetos((data ?? []).map(projetoFromDb));
  }, [sb]);

  const refreshPessoas = useCallback(async () => {
    const { data, error } = await sb
      .from('pessoas')
      .select('id,nome,email,user_id,invited_at,role,cliente_id,cliente_principal_id,cliente_secundario_id,capacidade_horas_semana,skills,senioridade,is_ceo,is_pm')
      .order('nome');
    if (error) return;
    setPessoas((data ?? []).map(pessoaFromDb));
  }, [sb]);

  const refreshTimeEntries = useCallback(async () => {
    // Janela de 90d na ordem decrescente. RLS filtra pessoa pra não-admin
    // (pessoa só vê as suas; admin vê todas).
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TIME_ENTRIES_WINDOW_DAYS);
    const { data, error } = await sb
      .from('time_entries')
      .select('id,task_id,pessoa_id,started_at,ended_at,note,criado_em')
      .gte('started_at', cutoff.toISOString())
      .order('started_at', { ascending: false })
      .limit(500);
    if (error) return;
    setTimeEntries((data ?? []).map(timeEntryFromDb));
  }, [sb]);

  const refreshAll = useCallback(async () => {
    // `loading` é só sinal de "primeira carga não terminou". Refetches
    // subsequentes acontecem em background sem trocar o flag — replica
    // o "live simulado" do app Alpine: estado da tela (scroll, filtros,
    // modal) preserva, dados só viram silenciosamente. `refreshing`
    // separado alimenta o indicador "Atualizando…" no AppNav.
    setError(null);
    setRefreshing(true);
    try {
      await Promise.all([refreshClientes(), refreshProjetos(), refreshPessoas(), refreshTasks(), refreshTimeEntries()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshClientes, refreshProjetos, refreshPessoas, refreshTasks, refreshTimeEntries]);

  const scheduleRefetch = useCallback(
    (which: 'tasks' | 'clientes' | 'projetos' | 'pessoas') => {
      const t = refetchTimers.current;
      if (t[which]) clearTimeout(t[which]!);
      const fn = {
        tasks: refreshTasks,
        clientes: refreshClientes,
        projetos: refreshProjetos,
        pessoas: refreshPessoas,
      }[which];
      t[which] = setTimeout(() => {
        fn();
      }, 1200);
    },
    [refreshTasks, refreshClientes, refreshProjetos, refreshPessoas],
  );

  // Boot inicial.
  useEffect(() => {
    const timers = refetchTimers.current;
    refreshAll();

    // Realtime precisa de auth válido — sem isso o servidor recusa o
    // postgres_changes silenciosamente (subscribe vira CHANNEL_ERROR ou
    // TIMED_OUT). Pegamos a sessão e empurramos o access_token, igual o
    // helper do supabase-js faz por baixo dos panos.
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;
    setRealtimeStatus('connecting');
    const resolveCurrentPessoa = async (
      session: Awaited<ReturnType<typeof sb.auth.getSession>>['data']['session'],
    ) => {
      if (!session?.user) {
        setCurrentPessoa(null);
        try {
          localStorage.removeItem('kliente360-current-pessoa');
        } catch {
          /* ok */
        }
        return;
      }
      const userId = session.user.id;
      const email = (session.user.email ?? '').trim().toLowerCase();
      const COLS =
        'id,nome,email,user_id,invited_at,role,cliente_id,cliente_principal_id,cliente_secundario_id,capacidade_horas_semana,skills,senioridade,is_ceo,is_pm';
      // 1) por user_id já vinculado
      const r1 = await sb.from('pessoas').select(COLS).eq('user_id', userId).maybeSingle();
      if (cancelled) return;
      if (r1.error) return;
      let pessoa = r1.data ? pessoaFromDb(r1.data as Record<string, unknown>) : null;
      // 2) por email (autovincula user_id na 1ª vez)
      if (!pessoa && email) {
        const r2 = await sb.from('pessoas').select(COLS).ilike('email', email).maybeSingle();
        if (cancelled) return;
        if (!r2.error && r2.data) {
          const raw = r2.data as Record<string, unknown>;
          if (!raw.user_id) {
            const upd = await sb
              .from('pessoas')
              .update({ user_id: userId })
              .eq('id', String(raw.id));
            if (!upd.error) raw.user_id = userId;
          }
          pessoa = pessoaFromDb(raw);
        }
      }
      // 3) RPC security-definer — cliente recém-convidado pode não ter
      //    SELECT em pessoas via RLS até o user_id estar vinculado. A
      //    função roda como definer, faz match por email do JWT e popula
      //    user_id atomicamente. Espelho de lib/app.js:468.
      if (!pessoa) {
        const rpc = await sb.rpc('app_link_current_user_to_pessoa');
        if (cancelled) return;
        if (!rpc.error && rpc.data) {
          const linked = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
          if (linked) pessoa = pessoaFromDb(linked as Record<string, unknown>);
        }
      }
      if (cancelled) return;
      setCurrentPessoa(pessoa);
      try {
        if (pessoa) localStorage.setItem('kliente360-current-pessoa', JSON.stringify(pessoa));
        else localStorage.removeItem('kliente360-current-pessoa');
      } catch {
        /* ok */
      }
    };

    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) sb.realtime.setAuth(session.access_token);
      // Resolve pessoa logada em paralelo ao realtime; cache em localStorage
      // já hidratou o state no useState inicial, então não pisca.
      resolveCurrentPessoa(session);

      // Realtime fica conectado mas em "dormente". A publication
      // supabase_realtime no projeto inclui só `tasks` — `clientes`,
      // `projetos` e `pessoas` ficaram de fora porque o time hoje dá
      // refresh manual clicando na logo, e o custo (latência + write
      // amplification por replica identity full) não compensou.
      //
      // Dívida explícita: pra ativar realtime real nessas 3 tabelas,
      // rodar supabase/realtime.sql (cria publication completa) +
      // `alter table <t> replica identity full` em cada uma. O código
      // abaixo já reage a eventos delas (scheduleRefetch faz um pull
      // novo) — não precisa mudar nada quando ligar.
      //
      // Tasks é a única que aplica delta in-place (payload.new direto
      // no array). As outras passam por refetch porque a lista
      // ordenada/agrupada justifica a query.
      channel = sb
        .channel('kliente360-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          (payload) => {
            const ev = (payload as { eventType: string }).eventType;
            if (ev === 'DELETE') {
              const id = (payload as { old?: { id?: string } }).old?.id;
              if (id) {
                setTasks((cur) => cur.filter((t) => t.id !== id));
              }
              return;
            }
            const row = (payload as { new?: Record<string, unknown> }).new;
            if (!row || !row.id) {
              scheduleRefetch('tasks');
              return;
            }
            const next = taskFromDb(row);
            setTasks((cur) => {
              const i = cur.findIndex((t) => t.id === next.id);
              if (i >= 0) {
                const out = cur.slice();
                out[i] = next;
                return out;
              }
              return [next, ...cur];
            });
          },
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => scheduleRefetch('clientes'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projetos' }, () => scheduleRefetch('projetos'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pessoas' }, () => scheduleRefetch('pessoas'))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setRealtimeStatus('subscribed');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('error');
          else if (status === 'CLOSED') setRealtimeStatus('closed');
        });
    })();

    // Escuta SIGNED_IN/SIGNED_OUT pra atualizar currentPessoa fora do boot
    // inicial (ex.: usuário faz login em outra aba ou via magic link).
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setCurrentPessoa(null);
        try {
          localStorage.removeItem('kliente360-current-pessoa');
        } catch {
          /* ok */
        }
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        resolveCurrentPessoa(session);
        if (event === 'TOKEN_REFRESHED' && session?.access_token) {
          sb.realtime.setAuth(session.access_token);
        }
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (channel) sb.removeChannel(channel);
      Object.keys(timers).forEach((k) => timers[k] && clearTimeout(timers[k]!));
    };
  }, [sb, refreshAll, scheduleRefetch]);

  // Mutações locais (optimistic). Mesma semântica dos helpers Alpine.
  const patchTask = useCallback<DataActions['patchTask']>((id, changes) => {
    let prev: Task | null = null;
    setTasks((cur) => {
      const i = cur.findIndex((t) => t.id === id);
      if (i < 0) return cur;
      prev = cur[i];
      const out = cur.slice();
      out[i] = { ...prev, ...changes };
      return out;
    });
    return prev;
  }, []);

  const patchTasks = useCallback<DataActions['patchTasks']>((ids, changes) => {
    const set = new Set(ids);
    setTasks((cur) => cur.map((t) => (set.has(t.id) ? { ...t, ...changes } : t)));
  }, []);

  const replaceTask = useCallback<DataActions['replaceTask']>((id, task) => {
    setTasks((cur) => {
      const i = cur.findIndex((t) => t.id === id);
      if (i < 0) return cur;
      const out = cur.slice();
      out[i] = task;
      return out;
    });
  }, []);

  const upsertTask = useCallback<DataActions['upsertTask']>((task) => {
    setTasks((cur) => {
      const i = cur.findIndex((t) => t.id === task.id);
      if (i >= 0) {
        const out = cur.slice();
        out[i] = task;
        return out;
      }
      return [task, ...cur];
    });
  }, []);

  const removeTask = useCallback<DataActions['removeTask']>((id) => {
    let removed: Task | null = null;
    setTasks((cur) => {
      const i = cur.findIndex((t) => t.id === id);
      if (i < 0) return cur;
      removed = cur[i];
      return cur.filter((t) => t.id !== id);
    });
    return removed;
  }, []);

  const removeTasks = useCallback<DataActions['removeTasks']>((ids) => {
    const set = new Set(ids);
    setTasks((cur) => cur.filter((t) => !set.has(t.id)));
  }, []);

  // ===== Mutadores in-memory de clientes / projetos / pessoas =====
  // Inserem se id novo, substituem se já existe. Lista ordenada por nome
  // pra refletir a UX do Alpine sem precisar reordenar no caller.
  const upsertCliente = useCallback<DataActions['upsertCliente']>((c) => {
    setClientes((cur) => {
      const i = cur.findIndex((x) => x.id === c.id);
      const out = i >= 0 ? cur.map((x) => (x.id === c.id ? c : x)) : [...cur, c];
      return out.sort((a, b) => a.nome.localeCompare(b.nome));
    });
  }, []);
  const removeCliente = useCallback<DataActions['removeCliente']>((id) => {
    setClientes((cur) => cur.filter((c) => c.id !== id));
  }, []);
  const upsertProjeto = useCallback<DataActions['upsertProjeto']>((p) => {
    setProjetos((cur) => {
      const i = cur.findIndex((x) => x.id === p.id);
      const out = i >= 0 ? cur.map((x) => (x.id === p.id ? p : x)) : [...cur, p];
      return out.sort((a, b) => a.nome.localeCompare(b.nome));
    });
  }, []);
  const removeProjeto = useCallback<DataActions['removeProjeto']>((id) => {
    setProjetos((cur) => cur.filter((p) => p.id !== id));
  }, []);
  const upsertPessoa = useCallback<DataActions['upsertPessoa']>((p) => {
    setPessoas((cur) => {
      const i = cur.findIndex((x) => x.id === p.id);
      const out = i >= 0 ? cur.map((x) => (x.id === p.id ? p : x)) : [...cur, p];
      return out.sort((a, b) => a.nome.localeCompare(b.nome));
    });
  }, []);
  const removePessoa = useCallback<DataActions['removePessoa']>((id) => {
    setPessoas((cur) => cur.filter((p) => p.id !== id));
  }, []);

  // ===== Mutators in-memory de time_entries =====
  // Mantém ordem desc por started_at (mais recente primeiro), igual ao refresh.
  const upsertTimeEntry = useCallback<DataActions['upsertTimeEntry']>((e) => {
    setTimeEntries((cur) => {
      const i = cur.findIndex((x) => x.id === e.id);
      const out = i >= 0 ? cur.map((x) => (x.id === e.id ? e : x)) : [e, ...cur];
      return out.sort((a, b) => b.startedAt - a.startedAt);
    });
  }, []);
  const removeTimeEntry = useCallback<DataActions['removeTimeEntry']>((id) => {
    setTimeEntries((cur) => cur.filter((e) => e.id !== id));
  }, []);

  const viewerRole: DataState['viewerRole'] = currentPessoa ? currentPessoa.role : null;
  const isCEO = !!currentPessoa?.is_ceo;

  // ===== Filtro admin-only: clientes internos (eh_interno=true) =====
  // Não-admins não veem o cliente interno (ex: "Kliente 360") nem os
  // projetos e tasks associados — em nenhuma lista, filtro ou dashboard.
  // Filtra no nível do contexto: um único ponto, zero mudanças nos
  // componentes. O banco não é alterado; é só visibilidade no front.
  const internalClienteIds = useMemo<Set<string>>(
    () => new Set(clientes.filter((c) => c.ehInterno).map((c) => c.id)),
    [clientes],
  );
  const visibleClientes = useMemo(
    () => (viewerRole === 'admin' ? clientes : clientes.filter((c) => !c.ehInterno)),
    [clientes, viewerRole],
  );
  const visibleProjetos = useMemo(
    () =>
      viewerRole === 'admin'
        ? projetos
        : projetos.filter((p) => !internalClienteIds.has(p.clienteId ?? '')),
    [projetos, viewerRole, internalClienteIds],
  );
  const visibleTasks = useMemo(
    () =>
      viewerRole === 'admin'
        ? tasks
        : tasks.filter((t) => !internalClienteIds.has(t.clienteId ?? '')),
    [tasks, viewerRole, internalClienteIds],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      tasks: visibleTasks,
      clientes: visibleClientes,
      projetos: visibleProjetos,
      pessoas,
      timeEntries,
      loading,
      refreshing,
      error,
      realtimeStatus,
      currentPessoa,
      viewerRole,
      isCEO,
      refreshAll,
      patchTask,
      patchTasks,
      replaceTask,
      upsertTask,
      removeTask,
      removeTasks,
      upsertCliente,
      removeCliente,
      upsertProjeto,
      removeProjeto,
      upsertPessoa,
      removePessoa,
      upsertTimeEntry,
      removeTimeEntry,
      markUserEditedTask,
    }),
    [
      visibleTasks, visibleClientes, visibleProjetos, pessoas, timeEntries,
      loading, refreshing, error, realtimeStatus,
      currentPessoa, viewerRole, isCEO,
      refreshAll,
      patchTask, patchTasks, replaceTask, upsertTask, removeTask, removeTasks,
      upsertCliente, removeCliente, upsertProjeto, removeProjeto, upsertPessoa, removePessoa,
      upsertTimeEntry, removeTimeEntry,
      markUserEditedTask,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData precisa estar dentro de <DataProvider>');
  return ctx;
}

// ===================== Lookups & índices =====================
// Hooks finos pra evitar reconstruir Maps a cada render quando só o
// consumidor mudou. Memos baseados em referência do array — qualquer
// mutação via helpers acima troca a ref, então o memo invalida.

export function useClientesById(): Map<string, Cliente> {
  const { clientes } = useData();
  return useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
}

export function useProjetosById(): Map<string, Projeto> {
  const { projetos } = useData();
  return useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);
}

export function usePessoasById(): Map<string, Pessoa> {
  const { pessoas } = useData();
  return useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
}

export function useTasksById(): Map<string, Task> {
  const { tasks } = useData();
  return useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
}

export function useProjetosByCliente(): Map<string, Projeto[]> {
  const { projetos } = useData();
  return useMemo(() => {
    const m = new Map<string, Projeto[]>();
    for (const p of projetos) {
      if (!p.clienteId) continue;
      let arr = m.get(p.clienteId);
      if (!arr) {
        arr = [];
        m.set(p.clienteId, arr);
      }
      arr.push(p);
    }
    return m;
  }, [projetos]);
}
