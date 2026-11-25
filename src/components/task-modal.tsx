'use client';

/**
 * Modal de tarefa — Onda 0 · Bloco 2.3
 * Componente único reutilizado em todas as telas (Backlog, Kanban, Foco etc).
 *
 * Arquitetura:
 *   - <TaskModalProvider> montado em (app)/layout — instância única
 *   - useTaskModal() expõe openEdit(taskId) / openNew() / close()
 *   - Estado interno: editing local + autosave debounced 800ms
 *   - Dados ao redor (clientes/projetos/pessoas/tasks) vêm do useData()
 *
 * Postergado pro 2.8:
 *   - Mention picker @ inline (textarea simples por enquanto)
 *   - Notificações de mention/assignment/status change
 *   - Comment drafts em localStorage
 *   - Permissões reais (assume admin enquanto currentPessoa/viewerRole
 *     não estão no data-store)
 *   - Toggle "task privada" (só CEO no Alpine) — depende de
 *     currentPessoa.is_ceo estar no store; campo `privada` continua sendo
 *     persistido/lido do banco, só não tem UI pra trocar
 *
 * Mantém:
 *   - Form completo: atribuição, descrição (lazy), checklist, esforço,
 *     etapa, visível cliente, bloqueado por, integração
 *   - Autosave + save manual + delete + arquivar/desarquivar
 *   - Conversa (post, reply, edit, delete, toggle visível)
 *   - Histórico (status + field changes)
 *   - Anexos (paste-upload, lista grid, delete, lightbox)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useData, useClientesById, useProjetosById, usePessoasById, useProjetosByCliente, useTasksById } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { fmtBytes, fmtPostedEm, renderCommentBody } from '@/lib/format';
import { fmtDate, lblStatus, missingFieldsForCurrentSubetapa, sumTimeEntriesHours, validateSubetapaAdvance } from '@/lib/task-utils';
import { SUB_TO_MACRO } from '@/lib/task-constants';
import { TASK_LIGHT_COLS as COLS_TAREFA, taskFromDb, timeEntryFromDb } from '@/lib/adapters';
import { track } from '@/lib/telemetry';
import { fmtDuration, useTimer } from '@/lib/use-timer';
import { Icon } from '@/components/icons';
import type { ChecklistItem, Task, TimeEntry } from '@/lib/types';
import { ANEXO_COLS, atalhoColar, enviarImagem, imagensDoClipboard, type Anexo } from '@/lib/anexos';
import { BotaoAnexarImagem, ImagensPendentes, juntarPendentes, MiniaturasAnexos } from '@/components/anexos-ui';
import { emSegundoPlano } from '@/lib/em-segundo-plano';
import { TaskModalV2 } from '@/components/task-modal-v2';

/** Telemetria · campos que a pessoa edita no modal (o resto é derivado). */
const CAMPOS_EDITAVEIS: (keyof Task)[] = [
  'titulo', 'descricao', 'clienteId', 'projetoId', 'pessoaId', 'prioridade', 'tipoTrabalho',
  'esforco', 'complexidade', 'prazo', 'subetapa', 'bloqueadoPor', 'bloqueadaPorTasks',
  'visivelCliente', 'checklist', 'escopo', 'areaTecnica', 'tempoRealHoras', 'privada', 'radar',
  'solucaoImplementada', 'valorEsperado', 'criterioAceite', 'valorEntregue', 'motivoReabertura',
];
const CAMPOS_TARDIOS: (keyof Task)[] = [
  'descricao', 'solucaoImplementada', 'valorEsperado', 'criterioAceite', 'valorEntregue', 'motivoReabertura',
];

/** Imagens por mensagem, para o CommentBubble sem passar props em cascata. */
const AnexosMsgContext = createContext<{
  porMsg: Map<string, Anexo[]>;
  urls: Record<string, string>;
  abrir: (a: Anexo) => void;
} | null>(null);

function ImagensDaMensagem({ commentId }: { commentId: string }) {
  const ctx = useContext(AnexosMsgContext);
  const lista = ctx?.porMsg.get(commentId) ?? [];
  if (!ctx || lista.length === 0) return null;
  return <MiniaturasAnexos anexos={lista} urls={ctx.urls} onAbrir={ctx.abrir} />;
}

// ============================================================
// Tipos das tabelas auxiliares (snake_case, vêm direto do banco)
// ============================================================
type Comment = {
  id: string;
  parent_id: string | null;
  author: string | null;
  author_pessoa_id: string | null;
  author_external_id: string | null;
  body: string;
  posted_em: string | null;
  criado_em: string;
  edited_em: string | null;
  external_source: string | null;
  external_id: string | null;
  visivel_cliente: boolean;
  from_cliente: boolean;
  /** Papel especial no fluxo do portal (pendencia, pedido_prioridade...). */
  kind?: string | null;
};

type HistoryEntry = {
  id: string;
  field: string;
  from_value: string | null;
  to_value: string | null;
  actor_pessoa_id: string | null;
  actor_source: string | null;
  occurred_at: string;
};

type Attachment = Anexo;

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'off';

// ============================================================
// Tipo do contexto
// ============================================================
type TaskModalContextValue = {
  openEdit: (taskId: string) => void;
  openNew: () => void;
  close: () => void;
};

const TaskModalContext = createContext<TaskModalContextValue | null>(null);

export function useTaskModal(): TaskModalContextValue {
  const ctx = useContext(TaskModalContext);
  if (!ctx) throw new Error('useTaskModal precisa de <TaskModalProvider>');
  return ctx;
}

// ============================================================
// Editing draft helpers
// ============================================================

function blankEditing(): Task {
  return {
    id: '',
    titulo: '',
    descricao: '',
    solucaoImplementada: '',
    valorEsperado: '',
    criterioAceite: '',
    valorEntregue: '',
    prioridadeSolicitadaCliente: null,
    motivoReabertura: '',
    bloqueadaPorTasks: [],
    tipoTrabalho: null,
    homologacaoEm: null,
    aprovadoEm: null,
    clienteId: '',
    projetoId: '',
    pessoaId: '',
    prioridade: '',
    esforco: 4,
    complexidade: 'media',
    prazo: '',
    status: 'backlog',
    subetapa: 'backlog',
    bloqueadoPor: '',
    visivelCliente: true,
    criadoEm: 0,
    statusEm: 0,
    subetapaEm: 0,
    andamentoEm: 0,
    ordem: null,
    checklist: [],
    reopenCount: 0,
    escopo: [],
    tempoRealHoras: null,
    externalSource: '',
    externalId: '',
    arquivadoEm: null,
    criadoPorIa: false,
    criadoPorCliente: false,
    triadaEm: null,
    triadaPor: null,
    motivoArquivamento: null,
    privada: false,
    radar: false,
    prioridadePedidoEm: null,
    prioridadePedidoAte: null,
    prioridadePedida: null,
    pendenciaRespondidaEm: null,
    webhookSyncStatus: '',
    webhookSyncError: '',
  };
}

/** Converte editing → payload snake_case pra UPDATE/INSERT no Postgres. */
function editingToDbPayload(e: Task): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    titulo: e.titulo.trim(),
    descricao: e.descricao ?? '',
    solucao_implementada: e.solucaoImplementada ?? '',
    valor_esperado: e.valorEsperado ?? '',
    criterio_aceite: e.criterioAceite ?? '',
    valor_entregue: e.valorEntregue ?? '',
    prioridade_solicitada_cliente: e.prioridadeSolicitadaCliente || null,
    motivo_reabertura: e.motivoReabertura || null,
    bloqueada_por_tasks: e.bloqueadaPorTasks ?? [],
    tipo_trabalho: e.tipoTrabalho || null,
    cliente_id: e.clienteId || null,
    projeto_id: e.projetoId || null,
    pessoa_id: e.pessoaId || null,
    prioridade: e.prioridade || null,
    esforco: Number(e.esforco) || 0,
    complexidade: e.complexidade || 'media',
    prazo: e.prazo || null,
    subetapa: e.subetapa || 'backlog',
    status: SUB_TO_MACRO[e.subetapa] || 'backlog',
    bloqueado_por: e.subetapa === 'bloqueado' ? e.bloqueadoPor || null : null,
    visivel_cliente: e.visivelCliente !== false,
    checklist: e.checklist ?? [],
    escopo: e.escopo ?? [],
    tempo_real_horas: e.tempoRealHoras == null || (e.tempoRealHoras as unknown as string) === '' ? null : Number(e.tempoRealHoras),
    external_id: e.externalId || null,
    privada: e.privada === true,
  };
  // Auto-classifica external_source ao preencher external_id manualmente.
  if (!e.externalSource && e.externalId) payload.external_source = 'salesforce';
  return payload;
}

const TASK_LIGHT_COLS =
  'id,titulo,cliente_id,projeto_id,pessoa_id,prioridade,esforco,complexidade,prazo,status,subetapa,bloqueado_por,visivel_cliente,criado_em,status_em,subetapa_em,andamento_em,ordem,checklist,reopen_count,escopo,tempo_real_horas,external_source,external_id,arquivado_em,criado_por_ia,triada_em,triada_por,motivo_arquivamento,privada';

// ============================================================
// Mention picker hook — espelho de anexos.js:341 (onMentionInput)
// ============================================================
// Detecta `@partial` no caret do textarea, devolve handlers pra plug
// nas props de onChange/onKeyDown + JSX da lista flutuante. Inserção
// reposiciona caret e mantém foco.
type MentionPickerState = {
  open: boolean;
  list: Array<{ id: string; nome: string }>;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  pick: (firstName: string) => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
};

function useMentionPicker(
  value: string,
  setValue: (v: string) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  pessoas: Array<{ id: string; nome: string; role: string; invited_at: string | null }>,
  excludePessoaId: string | null,
): MentionPickerState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const anchorRef = useRef<number | null>(null);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return pessoas
      .filter((p) => p.role !== 'cliente' && p.invited_at !== null && p.id !== excludePessoaId)
      .filter((p) => !q || (p.nome || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({ id: p.id, nome: p.nome }));
  }, [pessoas, query, excludePessoaId]);

  const pick = useCallback(
    (firstName: string) => {
      if (anchorRef.current == null) return;
      const anchor = anchorRef.current;
      const insert = '@' + firstName + ' ';
      const rest = value.slice(anchor).replace(/^@[A-Za-zÀ-ÿ0-9-]*/, insert);
      const next = value.slice(0, anchor) + rest;
      setValue(next);
      setOpen(false);
      const caret = anchor + insert.length;
      anchorRef.current = null;
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          try {
            el.setSelectionRange(caret, caret);
          } catch {
            /* noop */
          }
        }
      });
    },
    [value, setValue, textareaRef],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setValue(v);
      const caret = e.target.selectionStart ?? v.length;
      const before = v.slice(0, caret);
      const m = before.match(/(?:^|\s)@([A-Za-zÀ-ÿ0-9-]*)$/);
      if (m) {
        anchorRef.current = caret - m[1].length - 1;
        setQuery(m[1]);
        setActiveIdx(0);
        setOpen(true);
      } else if (open) {
        setOpen(false);
        anchorRef.current = null;
      }
    },
    [setValue, open],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open || !list.length) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % list.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + list.length) % list.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const p = list[activeIdx];
        if (p) pick((p.nome || '').split(/\s+/)[0]);
        return true;
      }
      if (e.key === 'Escape') {
        // ESC fecha picker antes de bubblar pro modal/lightbox.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        anchorRef.current = null;
        return true;
      }
      return false;
    },
    [open, list, activeIdx, pick],
  );

  return { open, list, activeIdx, setActiveIdx, pick, onChange, onKeyDown };
}

function MentionDropdown({ picker }: { picker: MentionPickerState }) {
  if (!picker.open || !picker.list.length) return null;
  // Abre PRA CIMA do textarea (bottom-full) — o composer vive no rodapé
  // do modal, então abrir pra baixo cortava o picker fora do viewport.
  return (
    <div
      className="absolute z-50 bottom-full mb-1 left-0 right-0 max-w-[260px] bg-elev border border-line rounded-md shadow-lg py-1 max-h-[200px] overflow-y-auto"
      onMouseDown={(e) => e.preventDefault()}
    >
      {picker.list.map((p, i) => (
        <button
          key={p.id}
          type="button"
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-brand-tint transition-colors ${i === picker.activeIdx ? '!bg-brand-tint !text-brand-dark font-medium' : ''}`}
          onMouseEnter={() => picker.setActiveIdx(i)}
          onClick={() => picker.pick((p.nome || '').split(/\s+/)[0])}
        >
          @{(p.nome || '').split(/\s+/)[0]}
          <span className="text-muted font-normal ml-1">· {p.nome}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Provider + componente
// ============================================================
export function TaskModalProvider({ children }: { children: React.ReactNode }) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const tasksById = useTasksById();
  // Cliente externo usa só o modal do portal; o modal da tarefa é do time
  const { viewerRole } = useData();
  const ehCliente = viewerRole === 'cliente';

  // Atualiza ?task=<id> via history.replaceState. Usa replace pra não
  // empilhar histórico nem invalidar router cache do Next.
  const syncUrlTaskParam = useCallback(
    (id: string | null) => {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const cur = sp.get('task');
      if (id && id !== '__new__') {
        if (cur === id) return;
        sp.set('task', id);
      } else {
        if (!cur) return;
        sp.delete('task');
      }
      const qs = sp.toString();
      const url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      window.history.replaceState(null, '', url);
    },
    [],
  );

  const openEdit = useCallback(
    (taskId: string) => {
      track('task_open', { task_id: taskId });
      setIsNew(false);
      setOpenTaskId(taskId);
      syncUrlTaskParam(taskId);
    },
    [syncUrlTaskParam],
  );
  const openNew = useCallback(() => {
    track('task_new_open');
    setIsNew(true);
    setOpenTaskId('__new__');
  }, []);
  const close = useCallback(() => {
    setOpenTaskId(null);
    setIsNew(false);
    syncUrlTaskParam(null);
  }, [syncUrlTaskParam]);

  // Telemetria · quanto tempo a tarefa ficou aberta (ao fechar ou trocar)
  useEffect(() => {
    if (!openTaskId) return;
    const inicio = Date.now();
    const id = openTaskId;
    return () => {
      const segundos = Math.round((Date.now() - inicio) / 1000);
      if (segundos >= 1) {
        track('task_close', {
          task_id: id === '__new__' ? null : id,
          props: { segundos, nova: id === '__new__' },
        });
      }
    };
  }, [openTaskId]);

  // Hidrata modal a partir de ?task=<uuid> na URL. Lê direto de
  // window.location pra não acionar CSR bailout do Next (useSearchParams
  // força prerender dinâmico em todas as páginas (app)/*). Roda quando
  // a task entra no store — assim deep link funciona mesmo se o usuário
  // chegar antes do boot terminar. lastHydratedRef impede reabrir após
  // fechar manual.
  const lastHydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = new URLSearchParams(window.location.search).get('task');
    if (!id) {
      lastHydratedRef.current = null;
      return;
    }
    if (lastHydratedRef.current === id) return;
    if (!tasksById.get(id)) return;
    lastHydratedRef.current = id;
    setIsNew(false);
    setOpenTaskId(id);
  }, [tasksById]);

  const value = useMemo<TaskModalContextValue>(
    () => ({ openEdit, openNew, close }),
    [openEdit, openNew, close],
  );

  return (
    <TaskModalContext.Provider value={value}>
      {children}
      {openTaskId !== null && !ehCliente && (
        isNew || tasksById.has(openTaskId) ? (
          <TaskModal taskId={isNew ? null : openTaskId} onClose={close} />
        ) : (
          <CarregandoTarefa taskId={openTaskId} onFalha={close} />
        )
      )}
    </TaskModalContext.Provider>
  );
}

// ============================================================
// Tarefa fora do que está carregado (criada por outra pessoa depois que a
// página abriu, arquivada, concluída antiga): busca no banco antes de abrir.
// Sem isso o modal não achava a tarefa e caía no formulário de tarefa nova
// (ex.: clicar no aviso de solicitação nova de cliente).
// ============================================================
function CarregandoTarefa({ taskId, onFalha }: { taskId: string; onFalha: () => void }) {
  const { upsertTask } = useData();
  const toast = useToastSafe();
  useEffect(() => {
    let vivo = true;
    createClient()
      .from('tasks')
      .select(COLS_TAREFA)
      .eq('id', taskId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error || !data) {
          toast.error('Não foi possível abrir a tarefa: ela não existe mais ou você não tem acesso.');
          onFalha();
          return;
        }
        // Entra no estado do app; o provider troca para o modal de verdade
        upsertTask(taskFromDb(data as Record<string, unknown>));
      });
    return () => { vivo = false; };
  }, [taskId, upsertTask, toast, onFalha]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-bg" role="status" aria-live="polite">
      <div className="bg-bg-elev border border-line rounded-lg shadow-xl px-4 py-3 text-sm text-muted">Abrindo tarefa…</div>
    </div>
  );
}

// ============================================================
// Modal — leva o trabalho pesado
// ============================================================
function TaskModal({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const {
    clientes,
    pessoas,
    tasks,
    patchTask,
    replaceTask,
    upsertTask,
    removeTask,
    currentPessoa,
    viewerRole,
    isCEO,
    markUserEditedTask,
    timeEntries,
  } = useData();
  const isAdmin = viewerRole === 'admin';
  const { activeEntry, elapsed, startTimer, stopTimer, starting, stopping, insertManualEntry } = useTimer();
  const projetosByCliente = useProjetosByCliente();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const tasksById = useTasksById();
  const toast = useToastSafe();

  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  if (!sbRef.current) sbRef.current = createClient();
  const sb = sbRef.current;

  const source = taskId ? tasksById.get(taskId) ?? null : null;

  // ===== Editing state =====
  const [editing, setEditing] = useState<Task>(() => (source ? { ...source } : blankEditing()));
  const editingRef = useRef(editing);
  editingRef.current = editing;

  // Criação: prints escolhidos/colados antes de a tarefa existir (sobem depois do insert)
  const [imagensNova, setImagensNova] = useState<File[]>([]);
  // Criação: responsável nasce como a pessoa logada (editável)
  const respPadraoFeito = useRef(false);
  useEffect(() => {
    if (respPadraoFeito.current || editing.id || editing.pessoaId) return;
    if (!currentPessoa?.id || viewerRole === 'cliente') return;
    respPadraoFeito.current = true;
    const id = currentPessoa.id;
    setEditing((cur) => (cur.id || cur.pessoaId ? cur : { ...cur, pessoaId: id }));
  }, [editing.id, editing.pessoaId, currentPessoa?.id, viewerRole]);

  const [bloqueioMotivo, setBloqueioMotivo] = useState('');
  const bloqueioMotivoRef = useRef('');
  bloqueioMotivoRef.current = bloqueioMotivo;

  // ===== Async data (comments, history, attachments) =====
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  // True enquanto o lazy-load da descrição roda (skeleton no textarea).
  // wasConcluido = task estava em concluido E foi movida pra outra subetapa
  // (caso de reabertura). Usado pelo missingFields (gate motivoReabertura)
  // e pra auto-ativar a aba Reabertura.
  const wasConcluido = useMemo(() => {
    if (!editing.id) return false;
    const prev = tasksById.get(editing.id);
    return !!prev && prev.status === 'concluido' && editing.subetapa !== 'concluido';
  }, [editing.id, editing.subetapa, tasksById]);

  // Set de campos obrigatórios pendentes pra subetapa atual.
  const missingFields = useMemo(() => {
    const sumHours = editing.id
      ? sumTimeEntriesHours(timeEntries.filter((te) => te.taskId === editing.id))
      : 0;
    return missingFieldsForCurrentSubetapa(editing, {
      timeEntriesHours: sumHours,
      wasConcluido,
      interna: !!clientesById.get(editing.clienteId)?.ehInterno,
    });
  }, [editing, timeEntries, wasConcluido, clientesById]);

  // Mesma regra do salvar (persist), checada antes de abrir o formulário da
  // transição: o aviso aparece ao clicar, não depois de escrever a mensagem
  const preChecarEtapa = useCallback(
    (sub: string): string | null => {
      const e = editingRef.current;
      const horas = e.id ? sumTimeEntriesHours(timeEntries.filter((te) => te.taskId === e.id)) : 0;
      const hasOpenPreReqs = (e.bloqueadaPorTasks ?? []).some((id) => {
        const dep = tasksById.get(id);
        return dep && dep.status !== 'concluido' && !dep.arquivadoEm;
      });
      const gate = validateSubetapaAdvance(e, sub, { timeEntriesHours: horas, hasOpenPreReqs, interna: !!clientesById.get(e.clienteId)?.ehInterno });
      return gate.ok ? null : gate.error;
    },
    [timeEntries, tasksById, clientesById],
  );

  // Bucket V · M.2 · tabs do formulário (desktop)
  type FormTab = 'triagem' | 'definicao' | 'execucao' | 'bloqueio' | 'reabertura' | 'admin';
  const FIELD_TO_TAB: Record<string, FormTab> = useMemo(() => ({
    clienteId: 'triagem',
    projetoId: 'triagem',
    pessoaId: 'triagem',
    prioridade: 'triagem',
    prazo: 'triagem',
    escopo: 'definicao',
    esforco: 'definicao',
    criterioAceite: 'definicao',
    tempoRealHoras: 'execucao',
    solucaoImplementada: 'execucao',
    valorEntregue: 'execucao',
    motivoReabertura: 'reabertura',
  }), []);

  // Conta pendências por aba. Bloqueio é gate manual (bloqueado_por
  // vazio quando subetapa=bloqueado), não vive em missingFields.
  const tabPendency = useMemo(() => {
    const counts: Record<FormTab, number> = {
      triagem: 0, definicao: 0, execucao: 0, bloqueio: 0, reabertura: 0, admin: 0,
    };
    missingFields.forEach((f) => {
      const t = FIELD_TO_TAB[f];
      if (t) counts[t] += 1;
    });
    if (editing.subetapa === 'bloqueado' && !editing.bloqueadoPor) counts.bloqueio += 1;
    return counts;
  }, [missingFields, FIELD_TO_TAB, editing.subetapa, editing.bloqueadoPor]);

  // Mapping explícito subetapa → aba default (revisado v1.03.178).
  // Pendências por aba ainda sobrescrevem (vai pra primeira com falha).
  const DEFAULT_TAB_BY_SUBETAPA: Record<string, FormTab> = {
    backlog: 'triagem',
    priorizado: 'triagem',
    em_definicao: 'definicao',
    escopo_definido: 'definicao',
    em_desenvolvimento: 'execucao',
    em_homologacao: 'execucao',
    em_revisao: 'execucao',
    pronto_producao: 'execucao',
    em_implantacao: 'execucao',
    bloqueado: 'bloqueio',
    concluido: 'execucao',
  };

  function pickInitialFormTab(): FormTab {
    if (wasConcluido && missingFields.has('motivoReabertura')) return 'reabertura';
    if (editing.subetapa === 'bloqueado') return 'bloqueio';
    if (tabPendency.triagem > 0) return 'triagem';
    if (tabPendency.definicao > 0) return 'definicao';
    if (tabPendency.execucao > 0) return 'execucao';
    return DEFAULT_TAB_BY_SUBETAPA[editing.subetapa] ?? 'triagem';
  }

  const [activeFormTab, setActiveFormTab] = useState<FormTab>(() => pickInitialFormTab());
  // Telemetria · troca de aba no modal (seção do formulário e painel lateral)
  const abaInicial = useRef(true);
  useEffect(() => {
    if (abaInicial.current) {
      abaInicial.current = false;
      return;
    }
    track('modal_aba', { task_id: editing.id || null, props: { aba: activeFormTab, tipo: 'formulario' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFormTab]);
  // Quando muda taskId (abrir outra task no mesmo modal), recalcula aba.
  const lastTaskIdRef = useRef<string>(editing.id);
  useEffect(() => {
    if (lastTaskIdRef.current !== editing.id) {
      lastTaskIdRef.current = editing.id;
      setActiveFormTab(pickInitialFormTab());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.id]);

  // Força aba Bloqueio quando entra em bloqueado · força Reabertura
  // quando wasConcluido sem motivo. Quando sai de uma aba condicional
  // (Bloqueio/Reabertura) que não está mais visível, faz fallback pra
  // aba do estágio atual. Evita espaço em branco visual.
  useEffect(() => {
    if (editing.subetapa === 'bloqueado' && activeFormTab !== 'bloqueio') {
      setActiveFormTab('bloqueio');
      return;
    }
    if (wasConcluido && missingFields.has('motivoReabertura') && activeFormTab !== 'reabertura') {
      setActiveFormTab('reabertura');
      return;
    }
    // Aba ativa virou inválida (ex: subetapa saiu de bloqueado).
    const validBloqueio = editing.subetapa === 'bloqueado';
    const validReabertura = wasConcluido;
    if (activeFormTab === 'bloqueio' && !validBloqueio) {
      setActiveFormTab(pickInitialFormTab());
    } else if (activeFormTab === 'reabertura' && !validReabertura) {
      setActiveFormTab(pickInitialFormTab());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.subetapa, wasConcluido]);

  // Reset scroll do tmodal-left ao trocar de aba · evita posição
  // herdada da aba anterior.
  const leftRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (leftRef.current) leftRef.current.scrollTop = 0;
  }, [activeFormTab]);

  const [descricaoLoading, setDescricaoLoading] = useState<boolean>(
    !!source && source.descricao === undefined,
  );

  // ===== Comment composers =====
  // Inicializa newComment com draft do localStorage (se existir, key
  // draft:comment:<task_id>). Restaura entre sessões pra não perder
  // texto se o user fechar o modal sem enviar — espelho de
  // task-modal.js:143 do Alpine.
  const [newComment, setNewComment] = useState<string>(() => {
    if (typeof window === 'undefined' || !taskId || taskId === '__new__') return '';
    try {
      return window.localStorage.getItem('draft:comment:' + taskId) ?? '';
    } catch {
      return '';
    }
  });
  const newCommentRef = useRef<HTMLTextAreaElement | null>(null);
  // Comentário novo nasce interno; a visibilidade troca depois, no próprio comentário
  const newCommentPublico = false;
  // Telemetria · valores dos campos de carga tardia, como carregados no modal
  const baseTardiaRef = useRef<Partial<Record<keyof Task, unknown>>>({});
  const [imagensMsg, setImagensMsg] = useState<File[]>([]);
  // Detecta viewport mobile pra ajustar placeholder do composer
  const [isMobileVp, setIsMobileVp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileVp(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const mentionPicker = useMentionPicker(
    newComment,
    setNewComment,
    newCommentRef,
    pessoas,
    currentPessoa?.id ?? null,
  );

  // Persiste draft a cada mudança. Roda mesmo com newComment=''
  // (pra limpar o slot após o envio). Usa window guard pra SSR.
  useEffect(() => {
    if (typeof window === 'undefined' || !taskId || taskId === '__new__') return;
    const key = 'draft:comment:' + taskId;
    try {
      if (newComment) window.localStorage.setItem(key, newComment);
      else window.localStorage.removeItem(key);
    } catch {
      /* quota cheia / safari private mode → ignora */
    }
  }, [newComment, taskId]);
  const [replyingToId, setReplyingToId] = useState<string>('');
  const [newReply, setNewReply] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string>('');
  const [editingCommentDraft, setEditingCommentDraft] = useState('');

  // ===== Attachments uploader =====
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentUploadLabel, setAttachmentUploadLabel] = useState('');
  const [lightboxAttachment, setLightboxAttachment] = useState<Attachment | null>(null);
  const anexosMsgCtx = useMemo(() => {
    const porMsg = new Map<string, Anexo[]>();
    for (const a of attachments) {
      if (!a.comment_id) continue;
      porMsg.set(a.comment_id, [...(porMsg.get(a.comment_id) ?? []), a]);
    }
    return { porMsg, urls: attachmentUrls, abrir: (a: Anexo) => setLightboxAttachment(a) };
  }, [attachments, attachmentUrls]);

  // ===== Autosave =====
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveStateRef = useRef(saveState);
  saveStateRef.current = saveState;
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeq = useRef(0);
  // suprime o primeiro pulse "dirty" quando carregamos a task — o useEffect
  // que escuta editing dispara após o set inicial.
  const skipNextDirty = useRef(true);

  // ===== Sync status push (realtime) — só sincroniza o chip do header =====
  // O toast de sucesso/erro é emitido pelo DataProvider (toast GLOBAL), o
  // que cobre o caso de salvar num cliente webhook_enabled (VB/CTF), onde
  // o modal fecha antes do webhook completar. Aqui só refletimos o status
  // no `editing` pra o chip do header reagir sem precisar reabrir.
  const live = editing.id ? tasksById.get(editing.id) : null;
  useEffect(() => {
    if (!editing.id || !live) return;
    const status = live.webhookSyncStatus ?? '';
    const error  = live.webhookSyncError  ?? '';
    setEditing((e) => {
      if (e.webhookSyncStatus === status && e.webhookSyncError === error) return e;
      skipNextDirty.current = true; // não marca dirty por sync server-driven
      return { ...e, webhookSyncStatus: status, webhookSyncError: error };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.webhookSyncStatus, live?.webhookSyncError, editing.id]);

  // ===== Sync de campos "externamente editáveis" (v1.03.209) =====
  // Kanban drop, Foco actions, Calendário select e realtime de outros
  // users mudam source (tasksById) mas NÃO o editing local do modal.
  // Se autosave disparar depois (por qualquer motivo), editingToDbPayload
  // manda TODOS os campos e sobrescreve as mudanças externas com valores
  // stale — bug B clássico.
  //
  // Solução: quando source mudar E o modal NÃO estiver dirty (usuário
  // sem edições pendentes locais), sincroniza os campos que outras
  // telas costumam mexer. Se estiver dirty/saving/error, respeita edição
  // do usuário e NÃO sobrescreve.
  useEffect(() => {
    if (!editing.id || !live) return;
    const s = saveStateRef.current;
    if (s === 'dirty' || s === 'saving' || s === 'error') return;
    const needsSync =
      editing.subetapa !== live.subetapa ||
      editing.status !== live.status ||
      editing.subetapaEm !== live.subetapaEm ||
      editing.statusEm !== live.statusEm ||
      editing.andamentoEm !== live.andamentoEm ||
      editing.pessoaId !== live.pessoaId ||
      editing.prazo !== live.prazo ||
      editing.prioridade !== live.prioridade ||
      editing.bloqueadoPor !== live.bloqueadoPor;
    if (!needsSync) return;
    skipNextDirty.current = true;
    setEditing((e) => ({
      ...e,
      subetapa: live.subetapa,
      status: live.status,
      subetapaEm: live.subetapaEm,
      statusEm: live.statusEm,
      andamentoEm: live.andamentoEm,
      pessoaId: live.pessoaId,
      prazo: live.prazo,
      prioridade: live.prioridade,
      bloqueadoPor: live.bloqueadoPor,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    live?.subetapa, live?.status, live?.subetapaEm, live?.statusEm, live?.andamentoEm,
    live?.pessoaId, live?.prazo, live?.prioridade, live?.bloqueadoPor,
    editing.id,
  ]);

  // ============ Helpers para resolver entidades ============
  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const projetosDoCliente = useMemo(() => {
    if (!editing.clienteId) return [];
    return (projetosByCliente.get(editing.clienteId) ?? []).filter((p) => !p.arquivadoEm);
  }, [editing.clienteId, projetosByCliente]);
  const pessoasNaoCliente = useMemo(
    () => pessoas.filter((p) => p.role !== 'cliente' && p.invited_at !== null),
    [pessoas],
  );
  const internalFirstNames = useMemo(() => {
    const set = new Set<string>();
    for (const p of pessoas) {
      if (p.role === 'cliente') continue;
      const first = (p.nome || '').split(/\s+/)[0];
      if (first) set.add(first);
    }
    return set;
  }, [pessoas]);

  // ============ Boot: carrega lazy + comments + history + attachments ============
  useEffect(() => {
    if (!taskId || taskId === '__new__') return;
    let cancelled = false;
    (async () => {
      // Lazy descricao + solucao_implementada + valor_esperado +
      // criterio_aceite + valor_entregue + motivo_reabertura se não
      // vieram do boot. `undefined` no source = nunca foi carregada
      // (light cols não incluem os textos longos pra payload menor).
      if (
        editingRef.current.descricao === undefined ||
        editingRef.current.solucaoImplementada === undefined ||
        editingRef.current.valorEsperado === undefined ||
        editingRef.current.criterioAceite === undefined ||
        editingRef.current.valorEntregue === undefined ||
        editingRef.current.motivoReabertura === undefined
      ) {
        const { data } = await sb
          .from('tasks')
          .select('descricao, solucao_implementada, valor_esperado, criterio_aceite, valor_entregue, motivo_reabertura')
          .eq('id', taskId)
          .single();
        if (!cancelled) {
          setEditing((cur) => ({
            ...cur,
            descricao: data?.descricao ?? '',
            solucaoImplementada: data?.solucao_implementada ?? '',
            valorEsperado: data?.valor_esperado ?? '',
            criterioAceite: data?.criterio_aceite ?? '',
            valorEntregue: data?.valor_entregue ?? '',
            motivoReabertura: data?.motivo_reabertura ?? '',
          }));
          setDescricaoLoading(false);
          skipNextDirty.current = true;
          baseTardiaRef.current = {
            descricao: data?.descricao ?? '',
            solucaoImplementada: data?.solucao_implementada ?? '',
            valorEsperado: data?.valor_esperado ?? '',
            criterioAceite: data?.criterio_aceite ?? '',
            valorEntregue: data?.valor_entregue ?? '',
            motivoReabertura: data?.motivo_reabertura ?? '',
          };
        }
      } else {
        if (!cancelled) setDescricaoLoading(false);
        const cur = editingRef.current;
        baseTardiaRef.current = {
          descricao: cur.descricao, solucaoImplementada: cur.solucaoImplementada,
          valorEsperado: cur.valorEsperado, criterioAceite: cur.criterioAceite,
          valorEntregue: cur.valorEntregue, motivoReabertura: cur.motivoReabertura,
        };
      }
      // Comments
      const { data: cdata } = await sb
        .from('task_comments')
        .select(
          'id, parent_id, author, author_external_id, author_pessoa_id, body, posted_em, criado_em, edited_em, external_source, external_id, visivel_cliente, from_cliente, kind',
        )
        .eq('task_id', taskId)
        .order('posted_em', { ascending: true, nullsFirst: true })
        .order('criado_em', { ascending: true });
      if (!cancelled) setComments((cdata ?? []) as Comment[]);

      // History
      const { data: hdata } = await sb
        .from('task_field_history')
        .select('id, field, from_value, to_value, actor_pessoa_id, actor_source, occurred_at')
        .eq('task_id', taskId);
      if (!cancelled) {
        const sorted = ((hdata ?? []) as HistoryEntry[]).sort(
          (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
        );
        setHistory(sorted);
      }

      // Attachments
      const { data: adata } = await sb
        .from('task_attachments')
        .select(ANEXO_COLS)
        .eq('task_id', taskId)
        .order('criado_em', { ascending: false });
      if (!cancelled) {
        setAttachments((adata ?? []) as Attachment[]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Signed URLs dos anexos. Refaz quando a lista muda.
  useEffect(() => {
    if (attachments.length === 0) {
      setAttachmentUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const paths = attachments.map((a) => a.storage_path);
      const { data } = await sb.storage.from('task-attachments').createSignedUrls(paths, 3600);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      data.forEach((row, idx) => {
        const a = attachments[idx];
        if (a && row?.signedUrl) map[a.id] = row.signedUrl;
      });
      setAttachmentUrls(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachments, sb]);

  // ============ Save (manual + autosave) ============
  const persist = useCallback(
    async (opts: { silent: boolean }): Promise<{ ok: boolean; error?: string }> => {
      const e = editingRef.current;
      if (!e.titulo.trim()) {
        return { ok: false, error: 'Dê um título à tarefa.' };
      }
      if (!e.id && !e.clienteId) {
        return { ok: false, error: 'Escolha o cliente.' };
      }
      if (!e.id && !e.descricao?.trim()) {
        return { ok: false, error: 'Descreva a solicitação.' };
      }
      // Tarefa interna (cliente Kliente 360) não tem valor esperado
      if (!e.id && !e.valorEsperado?.trim() && !clientesById.get(e.clienteId)?.ehInterno) {
        return { ok: false, error: 'Informe o valor esperado.' };
      }
      if (e.subetapa === 'bloqueado' && !e.bloqueadoPor) {
        return { ok: false, error: 'Informe quem está bloqueando (Nós / Cliente / Terceiro).' };
      }
      // Ondas 2.A + 2.B · gates por subetapa
      // (escopo em em_definicao+ · esforco em escopo_definido+ ·
      //  tempo_real em em_homologacao→concluido com fallback timesheet)
      const sumHoursForTask = e.id
        ? sumTimeEntriesHours(timeEntries.filter((te) => te.taskId === e.id))
        : 0;
      // 3.B · pré-reqs abertas bloqueiam conclusão
      const hasOpenPreReqs = (e.bloqueadaPorTasks ?? []).some((id) => {
        const dep = tasksById.get(id);
        return dep && dep.status !== 'concluido' && !dep.arquivadoEm;
      });
      const gate = validateSubetapaAdvance(e, e.subetapa, {
        timeEntriesHours: sumHoursForTask,
        hasOpenPreReqs,
        interna: !!clientesById.get(e.clienteId)?.ehInterno,
      });
      if (!gate.ok) return { ok: false, error: gate.error };
      // 3.3 · gate de reabertura: se estava 'concluido' e mudou pra outra,
      // exige motivo_reabertura preenchido.
      if (e.id) {
        const prevTask = tasksById.get(e.id) ?? null;
        if (prevTask && prevTask.status === 'concluido' && e.subetapa !== 'concluido') {
          if (!(e.motivoReabertura && e.motivoReabertura.trim().length > 0)) {
            return { ok: false, error: 'Informe o motivo da reabertura antes de salvar.' };
          }
        }
      }
      // Auto-fill silencioso (modo d): se manual vazio e tem horas no
      // timesheet, completa tempo_real_horas com a soma. Patcha editing
      // pra UI refletir e cai no payload abaixo.
      if (gate.autoFillTempo !== undefined && gate.autoFillTempo > 0) {
        e.tempoRealHoras = gate.autoFillTempo;
        setEditing((cur) => ({ ...cur, tempoRealHoras: gate.autoFillTempo as number }));
      }
      const payload = editingToDbPayload(e);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (e.id) {
        const prev = tasksById.get(e.id) ?? null;
        const subChanged = !!prev && prev.subetapa !== e.subetapa;
        const statusChanged = !!prev && prev.status !== (SUB_TO_MACRO[e.subetapa] || 'backlog');
        const enteringAndamento = statusChanged && (SUB_TO_MACRO[e.subetapa] || 'backlog') === 'andamento';
        if (subChanged) payload.subetapa_em = nowIso;
        if (statusChanged) payload.status_em = nowIso;
        if (enteringAndamento) payload.andamento_em = nowIso;

        // Optimistic local — TODOS os campos que o payload toca precisam
        // estar aqui, senão o store fica defasado (chip não aparece, sort
        // não reflete etc) e só atualiza no próximo boot refresh.
        if (prev) {
          patchTask(e.id, {
            titulo: e.titulo.trim(),
            descricao: e.descricao ?? '',
            solucaoImplementada: e.solucaoImplementada ?? '',
            valorEsperado: e.valorEsperado ?? '',
            criterioAceite: e.criterioAceite ?? '',
            valorEntregue: e.valorEntregue ?? '',
            prioridadeSolicitadaCliente: e.prioridadeSolicitadaCliente ?? null,
            motivoReabertura: e.motivoReabertura ?? '',
            bloqueadaPorTasks: [...(e.bloqueadaPorTasks ?? [])],
            clienteId: e.clienteId,
            projetoId: e.projetoId,
            pessoaId: e.pessoaId,
            prioridade: e.prioridade,
            esforco: Number(e.esforco) || 0,
            prazo: e.prazo,
            subetapa: e.subetapa,
            status: (SUB_TO_MACRO[e.subetapa] || 'backlog') as Task['status'],
            complexidade: e.complexidade,
            bloqueadoPor: e.subetapa === 'bloqueado' ? e.bloqueadoPor : '',
            visivelCliente: e.visivelCliente,
            checklist: e.checklist.map((c) => ({ ...c })),
            escopo: [...(e.escopo ?? [])],
            tempoRealHoras: (e.tempoRealHoras as unknown as string) === '' ? null : e.tempoRealHoras,
            externalId: e.externalId,
            externalSource: e.externalSource || (e.externalId ? 'salesforce' : ''),
            privada: e.privada,
            statusEm: statusChanged ? nowMs : prev.statusEm,
            subetapaEm: subChanged ? nowMs : prev.subetapaEm,
            andamentoEm: enteringAndamento ? nowMs : prev.andamentoEm,
          });
        }

        const { data: updated, error } = await sb
          .from('tasks')
          .update(payload)
          .eq('id', e.id)
          .select(TASK_LIGHT_COLS)
          .maybeSingle();
        if (error) {
          if (prev) replaceTask(e.id, prev);
          return { ok: false, error: error.message };
        }
        if (!updated) {
          if (prev) replaceTask(e.id, prev);
          return { ok: false, error: 'Sem permissão pra salvar ou tarefa foi removida.' };
        }

        // Reconcile local com valores derivados pelo trigger DB (ex:
        // status via sync_task_status, timestamps via defaults). Sem isso
        // o store fica com valores otimistas até o próximo boot. Filtra
        // undefined pra não sobrescrever campos lazy (descricao, etc)
        // que não vieram no TASK_LIGHT_COLS.
        const fresh = taskFromDb(updated as Record<string, unknown>);
        const reconciled: Partial<Task> = {};
        for (const [k, v] of Object.entries(fresh)) {
          if (v !== undefined) (reconciled as Record<string, unknown>)[k] = v;
        }
        patchTask(e.id, reconciled);

        // Log de mudanças no histórico (status + field changes)
        if (prev) {
          // Telemetria · só campos que a pessoa edita no modal. Campos de
          // carga tardia (descrição etc.) não vêm no store: comparam com o
          // valor carregado no modal, senão todo salvamento contava como edição.
          const norm = (v: unknown) =>
            v == null || v === '' || v === false || (Array.isArray(v) && v.length === 0) ? '' : JSON.stringify(v);
          const campos = CAMPOS_EDITAVEIS.filter((k) => {
            const antes = prev[k] !== undefined ? prev[k] : baseTardiaRef.current[k];
            return norm(antes) !== norm(e[k]);
          });
          for (const k of CAMPOS_TARDIOS) baseTardiaRef.current[k] = e[k];
          if (campos.length) track('task_update', { task_id: e.id, props: { campos, origem: 'modal' } });
          const TRACKED: { jsKey: keyof Task; field: string; fmt: (v: unknown) => string | null }[] = [
            { jsKey: 'prazo', field: 'prazo', fmt: (v) => (v as string) || null },
            { jsKey: 'esforco', field: 'esforco', fmt: (v) => (v == null ? null : String(v)) },
            { jsKey: 'prioridade', field: 'prioridade', fmt: (v) => (v as string) || null },
            { jsKey: 'complexidade', field: 'complexidade', fmt: (v) => (v as string) || null },
            { jsKey: 'pessoaId', field: 'pessoa', fmt: (v) => (v as string) || null },
            { jsKey: 'subetapa', field: 'subetapa', fmt: (v) => (v as string) || null },
            { jsKey: 'escopo', field: 'escopo', fmt: (v) => (v as string[])?.join(', ') || null },
            { jsKey: 'tempoRealHoras', field: 'tempo_real_horas', fmt: (v) => (v == null ? null : String(v)) },
            { jsKey: 'bloqueadoPor', field: 'bloqueado_por', fmt: (v) => (v as string) || null },
          ];
          const rows: Record<string, unknown>[] = [];
          if (statusChanged) {
            rows.push({
              task_id: e.id,
              field: 'status',
              from_value: prev.status,
              to_value: SUB_TO_MACRO[e.subetapa] || 'backlog',
              actor_pessoa_id: currentPessoa?.id ?? null,
              actor_source: 'app',
              occurred_at: nowIso,
            });
          }
          for (const { jsKey, field, fmt } of TRACKED) {
            const a = fmt(prev[jsKey]);
            const b = fmt(e[jsKey] as unknown);
            if (a !== b) {
              rows.push({
                task_id: e.id,
                field,
                from_value: a,
                to_value: b,
                actor_pessoa_id: currentPessoa?.id ?? null,
                actor_source: 'app',
                occurred_at: nowIso,
              });
            }
          }
          if (rows.length) {
            sb.from('task_field_history').insert(rows).then(() => {
              // Adiciona localmente pra refletir na timeline sem refetch.
              setHistory((cur) => {
                const fakeId = (offset: number) => `tmp-h-${nowMs}-${offset}`;
                const next = rows.map((r, idx) => ({
                  id: fakeId(idx),
                  field: String(r.field),
                  from_value: r.from_value as string | null,
                  to_value: r.to_value as string | null,
                  actor_pessoa_id: null,
                  actor_source: 'app',
                  occurred_at: nowIso,
                }));
                return [...next, ...cur];
              });
            });
          }

          // ===== Notificações (4.E) =====
          // Não toasta erro nem espera resposta — fire-and-forget.
          const notifRows: Record<string, unknown>[] = [];
          // Assignment: novo responsável diferente do anterior, não self.
          if (
            prev.pessoaId !== e.pessoaId &&
            e.pessoaId &&
            e.pessoaId !== currentPessoa?.id
          ) {
            notifRows.push({
              recipient_pessoa_id: e.pessoaId,
              kind: 'assigned',
              payload: { author: currentPessoa?.nome ?? 'app', task_id: e.id },
              source_task_id: e.id,
            });
          }
          // Status macro mudou e há responsável diferente do autor.
          if (
            statusChanged &&
            e.pessoaId &&
            e.pessoaId !== currentPessoa?.id
          ) {
            notifRows.push({
              recipient_pessoa_id: e.pessoaId,
              kind: 'status_change',
              payload: {
                author: currentPessoa?.nome ?? 'app',
                task_id: e.id,
                from: prev.status || '∅',
                to: SUB_TO_MACRO[e.subetapa] || 'backlog',
              },
              source_task_id: e.id,
            });
          }
          if (notifRows.length) {
            // .then() necessário · supabase-js v2 só executa a query
            // quando a Promise é consumida (lazy). Sem isso, INSERT
            // não dispara. Fire-and-forget mas com log de erro.
            sb.from('notifications').insert(notifRows).then(({ error }) => {
              if (error) console.warn('[notif] insert failed', error);
            });
          }

          // Motivo de bloqueio: sempre que houver motivo digitado E a task
          // estiver atualmente em 'bloqueado' (transição OU já estava),
          // insere como comment e limpa o campo. Permite empilhar
          // múltiplos motivos numa mesma task ao longo do bloqueio.
          // Bloqueio "aguardando cliente": o motivo é a pergunta pro
          // cliente → vira comment visível com kind='pendencia', que o
          // portal mostra em destaque. Demais bloqueios seguem internos.
          const motivo = bloqueioMotivoRef.current.trim();
          if (e.subetapa === 'bloqueado' && motivo) {
            const paraCliente = e.bloqueadoPor === 'cliente';
            const commentPayload = {
              task_id: e.id,
              body: motivo,
              author: currentPessoa?.nome ?? 'app',
              author_pessoa_id: currentPessoa?.id ?? null,
              visivel_cliente: paraCliente,
              from_cliente: false,
              posted_em: nowIso,
              kind: paraCliente ? 'pendencia' : null,
            };
            if (paraCliente && tasksById.get(e.id)?.pendenciaRespondidaEm) {
              patchTask(e.id, { pendenciaRespondidaEm: null });
              emSegundoPlano(sb.from('tasks').update({ pendencia_respondida_em: null }).eq('id', e.id), 'pendencia-reset');
            }
            sb.from('task_comments')
              .insert(commentPayload)
              .select('id')
              .single()
              .then(({ data: cData }) => {
                const localComment: Comment = {
                  id: cData?.id ?? `tmp-motivo-${nowMs}`,
                  parent_id: null,
                  body: motivo,
                  author: currentPessoa?.nome ?? 'app',
                  author_pessoa_id: currentPessoa?.id ?? null,
                  author_external_id: null,
                  visivel_cliente: paraCliente,
                  from_cliente: false,
                  external_source: null,
                  external_id: null,
                  posted_em: nowIso,
                  criado_em: nowIso,
                  edited_em: null,
                  kind: commentPayload.kind,
                };
                setComments((cur) => [...cur, localComment]);
                setBloqueioMotivo('');
              });
          }
        }
        return { ok: true };
      } else {
        // Insert
        payload.status_em = nowIso;
        payload.subetapa_em = nowIso;
        const { data, error } = await sb.from('tasks').insert(payload).select('*').single();
        if (error) return { ok: false, error: error.message };
        if (data) {
          track('task_create', { task_id: String(data.id), props: { origem: 'modal' } });
          // Adapter inline — taskFromDb importado seria redundante aqui
          const next: Task = {
            ...editingRef.current,
            id: String(data.id),
            criadoEm: data.criado_em ? new Date(data.criado_em).getTime() : Date.now(),
            statusEm: nowMs,
            subetapaEm: nowMs,
            arquivadoEm: data.arquivado_em || null,
          };
          upsertTask(next);
          setEditing(next);
          skipNextDirty.current = true;

          // Primeira entrada do histórico
          await sb.from('task_field_history').insert({
            task_id: data.id,
            field: 'status',
            from_value: null,
            to_value: data.status,
            actor_pessoa_id: currentPessoa?.id ?? null,
            actor_source: 'app',
            occurred_at: nowIso,
          });
        }
        if (!opts.silent) {
          // Em "criar" sem silent, fecha modal
          return { ok: true };
        }
        return { ok: true };
      }
    },
    [sb, tasksById, clientesById, patchTask, replaceTask, upsertTask, currentPessoa?.id, currentPessoa?.nome, timeEntries],
  );

  const autosaveNow = useCallback(async (opts?: { quiet?: boolean }) => {
    const e = editingRef.current;
    if (!e.id) return { ok: false } as { ok: false }; // só autosalva tasks já criadas
    if (!e.titulo.trim()) return { ok: false } as { ok: false };
    const seq = ++autosaveSeq.current;
    setSaveState('saving');
    const res = await persist({ silent: true });
    if (seq !== autosaveSeq.current) return res;
    if (res.ok) {
      setSaveState('saved');
      // Marca pra o watcher global toastar quando o webhook completar
      // (relevante apenas pra tasks SF — outras nem disparam webhook).
      markUserEditedTask(e.id);
    } else {
      setSaveState('error');
      // Antes só logava em warn — usuário podia fechar achando salvo.
      // Agora emite toast com o erro real (gates de subetapa, etc) pra
      // o usuário ver o motivo da falha imediatamente.
      if (!opts?.quiet) toast.error(res.error ?? 'Erro ao salvar (autosave).');
      // eslint-disable-next-line no-console
      console.warn('[autosave]', res.error);
    }
    return res;
  }, [persist, markUserEditedTask, toast]);
  // Ref sempre atualizado — evita incluir autosaveNow nas deps do effect
  // de dirty/debounce e previne o loop (patchTask → tasksById → persist
  // → autosaveNow ref muda → effect re-dispara → loop).
  const autosaveNowRef = useRef(autosaveNow);
  autosaveNowRef.current = autosaveNow;

  // Autosave OFF quando o cliente tem webhook_enabled=true (VB, CTF…).
  // Pra esses, o save dispara um webhook Salesforce — não pode rodar a
  // cada keystroke. Usuário precisa clicar "salvar" explicitamente.
  // Espelho do index.html:3552 do Alpine (data-state="off").
  const clienteWebhookEnabled = useMemo(
    () => !!(editing.clienteId && clientesById.get(editing.clienteId)?.webhookEnabled),
    [editing.clienteId, clientesById],
  );

  // Detecta mudanças em editing → marca dirty + debounce 800ms (a menos
  // que esteja em modo webhook off).
  useEffect(() => {
    if (skipNextDirty.current) {
      skipNextDirty.current = false;
      return;
    }
    if (!editing.id) return; // task nova: sem autosave até salvar manualmente
    if (clienteWebhookEnabled) {
      // Não autosalva, mas mantém saveState='off' no header pra sinalizar.
      setSaveState('off');
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      return;
    }
    setSaveState('dirty');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      autosaveNowRef.current();
    }, 800);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // autosaveNow intencionalmente fora das deps — usamos o ref pra sempre
    // chamar a versão mais recente sem re-disparar o effect quando persist
    // muda de referência após patchTask (evita loop dirty→save→dirty).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, clienteWebhookEnabled]);

  // Motivo de bloqueio: NÃO salva sozinho enquanto a pessoa digita (antes
  // havia um autosave de 1,5 s que postava a pergunta pela metade). Ele é
  // gravado no próximo salvamento explícito: botão Salvar ou ao fechar.

  // Quando muda cliente (Sem→Com webhook ou vice-versa) sem que o user
  // tenha tocado em outro campo, o useEffect acima já trata. Mas o
  // estado inicial em "idle" precisa virar "off" se a task já abre com
  // webhook on. Roda só na primeira render quando o cliente já é off.
  useEffect(() => {
    if (clienteWebhookEnabled && saveState === 'idle') {
      setSaveState('off');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteWebhookEnabled]);

  // ============ Close flow (flush) ============
  const close = useCallback(async (opts?: { force?: boolean }) => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    // FORCE close (botão X) descarta edições inválidas sem persistir.
    // ESC nunca chega aqui em estado de erro (bloqueado no listener).
    // Save manual quando dá ruim também não chega aqui (toast.error +
    // mantém aberto). Esse caminho é só "salvar pendências e fechar".
    if (opts?.force && saveStateRef.current === 'error') {
      onClose();
      return;
    }
    // Comentário, resposta e edição de comentário só saem com ação explícita
    // (Enviar / ⌘↵). Fechar não posta nada; o rascunho do comentário novo
    // fica guardado no navegador e volta quando a tarefa reabrir.
    // Autosave de fechamento: se falha (gate de subetapa por ex.),
    // emite toast E NÃO FECHA o modal — evita o caso do usuário ver
    // o autosave parado em "error" e fechar achando que tá tudo certo.
    let autosaveFailed = false;
    if (saveStateRef.current === 'dirty' && editing.id) {
      try {
        const res = await autosaveNow();
        if (res && 'ok' in res && !res.ok) autosaveFailed = true;
      } catch {
        autosaveFailed = true;
      }
    }
    if (autosaveFailed) return; // mantém aberto pra usuário corrigir
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.id, autosaveNow, onClose]);

  // ESC fecha · MAS bloqueado quando autosave falhou (gate de campo
  // obrigatório). Só botão de fechar (×) consegue sair sem persistir
  // edições inválidas — força o usuário a notar o erro antes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxAttachment) setLightboxAttachment(null);
        else if (saveStateRef.current === 'error') {
          // bloqueia ESC com autosave em erro
          return;
        }
        else if (!replyingToId) close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, replyingToId, lightboxAttachment]);

  // Paste-upload de imagem em qualquer lugar do modal
  const onModalPaste = useCallback(
    async (ev: React.ClipboardEvent) => {
      const files = ev.clipboardData?.files;
      if (!files || !files.length || !editing.id) return;
      const imgs = Array.from(files).filter((f) => /^image\/(png|jpe?g|webp)$/i.test(f.type));
      if (!imgs.length) return;
      ev.preventDefault();
      for (const f of imgs) {
        await uploadAttachment(f);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing.id],
  );

  // ============ Comments ============
  // Notificações de mention + comment_on_my_task — fire-and-forget.
  // Chamado após cada postComment / submitReply bem-sucedido.
  const notifyAfterComment = useCallback(
    (commentId: string, body: string) => {
      if (!editing.id) return;
      const rows: Record<string, unknown>[] = [];
      // Mentions: @firstname que bate com pessoa interna (excluindo cliente)
      const found = new Set<string>();
      const re = /@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(body)) !== null) found.add(m[1]);
      if (found.size) {
        const mentioned = pessoas
          .filter((p) => p.role !== 'cliente' && p.invited_at !== null)
          .filter((p) => found.has((p.nome || '').split(/\s+/)[0]))
          .map((p) => p.id);
        for (const rid of mentioned) {
          rows.push({
            recipient_pessoa_id: rid,
            kind: 'mention',
            payload: { author: currentPessoa?.nome ?? 'app', task_id: editing.id, comment_id: commentId },
            source_task_id: editing.id,
            source_comment_id: commentId,
          });
        }
      }
      // comment_on_my_task: dono da task ≠ autor
      const ownerId = editing.pessoaId;
      if (ownerId && ownerId !== currentPessoa?.id) {
        rows.push({
          recipient_pessoa_id: ownerId,
          kind: 'comment_on_my_task',
          payload: {
            author: currentPessoa?.nome ?? 'app',
            task_id: editing.id,
            comment_id: commentId,
            preview: body.slice(0, 80),
          },
          source_task_id: editing.id,
          source_comment_id: commentId,
        });
      }
      if (rows.length) {
        sb.from('notifications').insert(rows).then(({ error }) => {
          if (error) console.warn('[notif comment] insert failed', error);
        });
      }
    },
    [editing.id, editing.pessoaId, pessoas, currentPessoa, sb],
  );

  const postComment = useCallback(async () => {
    const imgs = imagensMsg;
    const body =
      newComment.trim() || (imgs.length ? (imgs.length === 1 ? 'Enviou uma imagem.' : `Enviou ${imgs.length} imagens.`) : '');
    if (!body || !editing.id) return;
    track('comment_post', { task_id: editing.id, props: { visivel_cliente: newCommentPublico, resposta: false } });
    const authorName = currentPessoa?.nome ?? 'app';
    const authorPessoaId = currentPessoa?.id ?? null;
    const tempId = 'tmp-' + Math.random().toString(36).slice(2, 8);
    const optimistic: Comment = {
      id: tempId,
      parent_id: null,
      author: authorName,
      author_pessoa_id: authorPessoaId,
      author_external_id: null,
      body,
      posted_em: null,
      criado_em: new Date().toISOString(),
      edited_em: null,
      external_source: null,
      external_id: null,
      visivel_cliente: newCommentPublico,
      from_cliente: false,
    };
    setComments((cur) => [optimistic, ...cur]);
    setNewComment('');
    const { data, error } = await sb
      .from('task_comments')
      .insert({
        task_id: editing.id,
        author: authorName,
        author_pessoa_id: authorPessoaId,
        body,
        visivel_cliente: newCommentPublico,
        from_cliente: false,
      })
      .select(
        'id, parent_id, author, body, author_pessoa_id, external_source, posted_em, criado_em, visivel_cliente, from_cliente, edited_em',
      )
      .single();
    if (error || !data) {
      setComments((cur) => cur.filter((c) => c.id !== tempId));
      setNewComment(body);
      toast.error('Erro ao comentar: ' + (error?.message ?? 'falha'));
      return;
    }
    setComments((cur) => cur.map((c) => (c.id === tempId ? (data as Comment) : c)));
    notifyAfterComment((data as Comment).id, body);
    if (imgs.length) {
      setImagensMsg([]);
      for (const file of imgs) {
        const r = await enviarImagem(sb, {
          taskId: editing.id,
          file,
          autorPessoaId: authorPessoaId,
          commentId: (data as Comment).id,
          visivelCliente: newCommentPublico,
        });
        if (r.erro || !r.anexo) toast.error(r.erro ?? 'Falha ao enviar imagem.');
        else setAttachments((cur) => [r.anexo as Attachment, ...cur]);
      }
      track('anexo_imagem', { task_id: editing.id, props: { portal: false, qtd: imgs.length, origem: 'conversa' } });
    }
  }, [newComment, newCommentPublico, imagensMsg, editing.id, sb, currentPessoa, notifyAfterComment, toast]);

  const submitReply = useCallback(
    async (parentId: string, corpo?: string) => {
      const body = (corpo ?? newReply).trim();
      if (!body || !editing.id || !parentId) return;
      const parent = comments.find((c) => c.id === parentId);
      const visivel = !!parent?.visivel_cliente;
      track('comment_post', { task_id: editing.id, props: { visivel_cliente: visivel, resposta: true } });
      const authorName = currentPessoa?.nome ?? 'app';
      const authorPessoaId = currentPessoa?.id ?? null;
      const tempId = 'tmp-' + Math.random().toString(36).slice(2, 8);
      const optimistic: Comment = {
        id: tempId,
        parent_id: parentId,
        author: authorName,
        author_pessoa_id: authorPessoaId,
        author_external_id: null,
        body,
        posted_em: null,
        criado_em: new Date().toISOString(),
        edited_em: null,
        external_source: null,
        external_id: null,
        visivel_cliente: visivel,
        from_cliente: false,
      };
      setComments((cur) => [...cur, optimistic]);
      setNewReply('');
      setReplyingToId('');
      const { data, error } = await sb
        .from('task_comments')
        .insert({
          task_id: editing.id,
          parent_id: parentId,
          author: authorName,
          author_pessoa_id: authorPessoaId,
          body,
          visivel_cliente: visivel,
          from_cliente: false,
        })
        .select(
          'id, parent_id, author, body, author_pessoa_id, external_source, posted_em, criado_em, visivel_cliente, from_cliente, edited_em',
        )
        .single();
      if (error || !data) {
        setComments((cur) => cur.filter((c) => c.id !== tempId));
        setNewReply(body);
        setReplyingToId(parentId);
        toast.error('Erro ao responder: ' + (error?.message ?? 'falha'));
        return;
      }
      setComments((cur) => cur.map((c) => (c.id === tempId ? (data as Comment) : c)));
      notifyAfterComment((data as Comment).id, body);
    },
    [newReply, editing.id, comments, sb, currentPessoa, notifyAfterComment, toast],
  );

  const saveEditComment = useCallback(
    async (id: string) => {
      const body = editingCommentDraft.trim();
      if (!body) {
        toast.error('Comentário não pode ficar vazio.');
        return;
      }
      const i = comments.findIndex((c) => c.id === id);
      if (i < 0) return;
      const prev = comments[i];
      if (body === (prev.body ?? '').trim()) {
        setEditingCommentId('');
        setEditingCommentDraft('');
        return;
      }
      const nowIso = new Date().toISOString();
      setComments((cur) => cur.map((c) => (c.id === id ? { ...c, body, edited_em: nowIso } : c)));
      setEditingCommentId('');
      setEditingCommentDraft('');
      const { error } = await sb.from('task_comments').update({ body, edited_em: nowIso }).eq('id', id);
      if (error) {
        setComments((cur) => cur.map((c) => (c.id === id ? prev : c)));
        toast.error('Erro ao salvar: ' + error.message);
      }
    },
    [comments, editingCommentDraft, sb, toast],
  );

  const deleteComment = useCallback(
    async (c: Comment) => {
      const isReply = !!c.parent_id;
      const msg = isReply ? 'Excluir esta resposta?' : 'Excluir este comentário (e suas respostas)?';
      if (!confirm(msg)) return;
      const idsToRemove = new Set<string>([c.id]);
      if (!isReply) {
        comments.filter((x) => x.parent_id === c.id).forEach((x) => idsToRemove.add(x.id));
      }
      const prev = comments;
      setComments(prev.filter((x) => !idsToRemove.has(x.id)));
      if (!isReply) {
        const replyIds = [...idsToRemove].filter((id) => id !== c.id);
        if (replyIds.length) await sb.from('task_comments').delete().in('id', replyIds);
      }
      const { error } = await sb.from('task_comments').delete().eq('id', c.id);
      if (error) {
        setComments(prev);
        toast.error('Erro ao excluir: ' + error.message);
      }
    },
    [comments, sb, toast],
  );

  const toggleCommentVisivel = useCallback(
    async (c: Comment) => {
      const next = !c.visivel_cliente;
      track('comment_visibilidade', { props: { visivel_cliente: next } });
      setComments((cur) =>
        cur.map((x) => (x.id === c.id ? { ...x, visivel_cliente: next } : x)),
      );
      const { error } = await sb
        .from('task_comments')
        .update({ visivel_cliente: next })
        .eq('id', c.id);
      if (error) {
        setComments((cur) =>
          cur.map((x) => (x.id === c.id ? { ...x, visivel_cliente: c.visivel_cliente } : x)),
        );
        toast.error('Erro ao alterar visibilidade: ' + error.message);
      }
    },
    [sb, toast],
  );

  // ============ Attachments ============
  // Anexo solto (aba Anexos / colar fora do campo de mensagem): nasce interno.
  // Imagem enviada junto da mensagem segue a visibilidade dela.
  const uploadAttachment = useCallback(
    async (file: File) => {
      if (!editing.id) return;
      setAttachmentUploading(true);
      setAttachmentUploadLabel('enviando…');
      try {
        const r = await enviarImagem(sb, {
          taskId: editing.id,
          file,
          autorPessoaId: currentPessoa?.id ?? null,
          visivelCliente: false,
        });
        if (r.erro || !r.anexo) {
          toast.error(r.erro ?? 'Falha ao enviar imagem.');
          return;
        }
        setAttachments((cur) => [r.anexo as Attachment, ...cur]);
      } finally {
        setAttachmentUploading(false);
        setAttachmentUploadLabel('');
      }
    },
    [editing.id, sb, toast, currentPessoa?.id],
  );

  const deleteAttachment = useCallback(
    async (a: Attachment) => {
      if (!confirm('Excluir este anexo?')) return;
      const prev = attachments;
      setAttachments(prev.filter((x) => x.id !== a.id));
      if (lightboxAttachment?.id === a.id) setLightboxAttachment(null);
      const { error } = await sb.from('task_attachments').delete().eq('id', a.id);
      if (error) {
        setAttachments(prev);
        toast.error('Erro ao excluir: ' + error.message);
        return;
      }
      sb.storage
        .from('task-attachments')
        .remove([a.storage_path])
        .catch(() => {});
    },
    [attachments, lightboxAttachment, sb, toast],
  );

  /** Resposta do time a um pedido de prioridade do cliente (portal).
   *  Define a prioridade interna (pode manter), limpa o pedido pendente e
   *  publica a resposta na conversa visível ao cliente. */
  const responderPedidoPrioridade = useCallback(
    async (novaPrio: string, resposta: string, novoPrazo?: string | null) => {
      if (!editing.id) return false;
      track('prioridade_pedido_resposta', { task_id: editing.id, props: { mudou: novaPrio !== editing.prioridade } });
      const prevTask = tasksById.get(editing.id);
      const nowIso = new Date().toISOString();
      const mudou = !!novaPrio && novaPrio !== editing.prioridade;
      // Banco guarda o nível pedido e define o resultado (aceito/mantido)
      const upd: Record<string, unknown> = { prioridade_pedido_em: null, prioridade_pedido_ate: null };
      if (mudou) upd.prioridade = novaPrio;
      // Aceite com prazo pedido pelo cliente: aplica o novo prazo
      const mudouPrazo = !!novoPrazo && novoPrazo !== editing.prazo;
      if (mudouPrazo) upd.prazo = novoPrazo;
      patchTask(editing.id, {
        prioridadePedidoEm: null,
        prioridadePedidoAte: null,
        ...(mudou ? { prioridade: novaPrio as Task['prioridade'] } : {}),
        ...(mudouPrazo ? { prazo: novoPrazo as string } : {}),
      });
      skipNextDirty.current = true;
      setEditing((cur) => ({
        ...cur,
        prioridadePedidoEm: null,
        prioridadePedidoAte: null,
        ...(mudou ? { prioridade: novaPrio as Task['prioridade'] } : {}),
        ...(mudouPrazo ? { prazo: novoPrazo as string } : {}),
      }));
      const { error } = await sb.from('tasks').update(upd).eq('id', editing.id);
      if (error) {
        if (prevTask) replaceTask(editing.id, prevTask);
        toast.error('Erro ao responder pedido: ' + error.message);
        return false;
      }
      if (mudou) {
        emSegundoPlano(sb.from('task_field_history').insert({
          task_id: editing.id,
          field: 'prioridade',
          from_value: editing.prioridade || null,
          to_value: novaPrio,
          actor_pessoa_id: currentPessoa?.id ?? null,
          actor_source: 'app',
          occurred_at: nowIso,
        }), 'historico-prioridade');
      }
      const commentPayload = {
        task_id: editing.id,
        body: resposta,
        author: currentPessoa?.nome ?? 'app',
        author_pessoa_id: currentPessoa?.id ?? null,
        visivel_cliente: true,
        from_cliente: false,
        posted_em: nowIso,
        kind: 'resposta_prioridade',
      };
      const { data: cData } = await sb.from('task_comments').insert(commentPayload).select('id').single();
      setComments((cur) => [
        ...cur,
        {
          ...commentPayload,
          id: cData?.id ?? `tmp-prio-${Date.now()}`,
          parent_id: null,
          author_external_id: null,
          external_source: null,
          external_id: null,
          criado_em: nowIso,
          edited_em: null,
        },
      ]);
      if (mudouPrazo) {
        emSegundoPlano(sb.from('task_field_history').insert({
          task_id: editing.id,
          field: 'prazo',
          from_value: editing.prazo || null,
          to_value: novoPrazo,
          actor_pessoa_id: currentPessoa?.id ?? null,
          actor_source: 'app',
          occurred_at: nowIso,
        }), 'historico-prazo');
      }
      toast.success(mudou || mudouPrazo ? 'Pedido aceito. Cliente avisado.' : 'Resposta enviada ao cliente.');
      return true;
    },
    [editing.id, editing.prioridade, editing.prazo, tasksById, patchTask, replaceTask, sb, toast, currentPessoa?.id, currentPessoa?.nome],
  );

  /** Toggle do Radar do CEO · botão no subheader. Só CEO enxerga o
   *  botão · trigger DB `enforce_radar_ceo_only` reverte se caller
   *  não é CEO (defesa em profundidade).
   *
   *  Estratégia: optimistic patch + await UPDATE `.select().single()` +
   *  reconciliar com a row retornada pelo DB (via `taskFromDb`). Se o
   *  trigger reverteu radar (caller não-CEO), a row retornada já vem
   *  com o valor correto e a store fica sincronizada. Sem risco de UI
   *  divergir do banco. */
  const toggleRadar = useCallback(async () => {
    if (!editing.id || !isCEO) return;
    const next = !editing.radar;
    track('radar_toggle', { task_id: editing.id, props: { ligado: next } });
    const prevTask = tasksById.get(editing.id);
    patchTask(editing.id, { radar: next });
    setEditing((cur) => ({ ...cur, radar: next }));
    skipNextDirty.current = true;
    const { data, error } = await sb
      .from('tasks')
      .update({ radar: next })
      .eq('id', editing.id)
      .select('*')
      .single();
    if (error) {
      if (prevTask) replaceTask(editing.id, prevTask);
      setEditing((cur) => ({ ...cur, radar: !next }));
      toast.error('Erro ao ' + (next ? 'marcar' : 'desmarcar') + ' radar: ' + error.message);
      return;
    }
    if (data) {
      // Reconcilia store com o que o DB de fato persistiu (leva em conta
      // o trigger enforce_radar_ceo_only, que reverte silenciosamente
      // pra caller não-CEO). `taskFromDb` preserva descricao lazy se
      // presente na row atual.
      const fresh = taskFromDb(data as Record<string, unknown>);
      // preserva campos lazy que a row `select('*')` já traz mas que
      // não estavam no boot (descricao/solucao/etc) — passa direto.
      replaceTask(editing.id, fresh);
      setEditing((cur) => ({ ...cur, radar: fresh.radar }));
    }
  }, [editing.id, editing.radar, isCEO, patchTask, replaceTask, sb, toast, tasksById]);

  // ============ Footer actions ============
  const arquivarTask = useCallback(async () => {
    if (!editing.id) return;
    const nowIso = new Date().toISOString();
    const prev = patchTask(editing.id, { arquivadoEm: nowIso });
    setEditing((cur) => ({ ...cur, arquivadoEm: nowIso }));
    skipNextDirty.current = true;
    const { error } = await sb.from('tasks').update({ arquivado_em: nowIso }).eq('id', editing.id);
    if (error) {
      if (prev) replaceTask(editing.id, prev);
      toast.error('Erro ao arquivar: ' + error.message);
    }
  }, [editing.id, patchTask, replaceTask, sb, toast]);

  const desarquivarTask = useCallback(async () => {
    if (!editing.id) return;
    const prev = patchTask(editing.id, { arquivadoEm: null });
    setEditing((cur) => ({ ...cur, arquivadoEm: null }));
    skipNextDirty.current = true;
    const { error } = await sb.from('tasks').update({ arquivado_em: null }).eq('id', editing.id);
    if (error) {
      if (prev) replaceTask(editing.id, prev);
      toast.error('Erro ao desarquivar: ' + error.message);
    }
  }, [editing.id, patchTask, replaceTask, sb, toast]);

  const deleteTask = useCallback(async () => {
    if (!editing.id) return;
    if (!confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;
    const prev = removeTask(editing.id);
    onClose();
    try {
      const { data: atts } = await sb
        .from('task_attachments')
        .select('storage_path')
        .eq('task_id', editing.id);
      const paths = ((atts ?? []) as { storage_path: string | null }[])
        .map((a) => a.storage_path)
        .filter((p): p is string => !!p);
      if (paths.length) await sb.storage.from('task-attachments').remove(paths);
    } catch {
      /* best-effort */
    }
    const { error } = await sb.from('tasks').delete().eq('id', editing.id);
    if (error) {
      if (prev) upsertTask(prev);
      toast.error('Erro ao excluir: ' + error.message);
    }
  }, [editing.id, removeTask, upsertTask, sb, onClose, toast]);

  const saveManual = useCallback(async () => {
    setSaveState('saving');
    const idBefore = editingRef.current.id;
    const res = await persist({ silent: false });
    if (res.ok) {
      setSaveState('saved');
      // editingRef pode ter ID novo (caso de "criar"); usa o atual.
      const idAfter = editingRef.current.id || idBefore;
      if (!idBefore && idAfter && imagensNova.length) {
        for (const file of imagensNova) {
          const r = await enviarImagem(sb, { taskId: idAfter, file, autorPessoaId: currentPessoa?.id ?? null, visivelCliente: false });
          if (r.erro) toast.error(r.erro);
        }
        track('anexo_imagem', { task_id: idAfter, props: { qtd: imagensNova.length, origem: 'criacao' } });
      }
      if (idAfter) markUserEditedTask(idAfter);
      onClose();
    } else {
      setSaveState('error');
      toast.error(res.error ?? 'Erro ao salvar.');
    }
  }, [persist, onClose, toast, markUserEditedTask, imagensNova, sb, currentPessoa?.id]);

  // ⌘/Ctrl+Enter salva e fecha. Roda no listener window — handlers
  // locais dos textareas de comment/reply/edit-comment chamam
  // preventDefault PRIMEIRO (postam o comment) e marcam defaultPrevented,
  // então o salva-fecha não atropela quando o user tá comentando.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      saveManual();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveManual]);

  // ============ Render helpers ============

  const autosaveLabel = (): string => {
    if (saveState === 'off') return 'autosave off';
    if (saveState === 'saving') return 'salvando…';
    if (saveState === 'dirty') return 'editando…';
    if (saveState === 'error') return '⚠ FALHOU · clique Salvar';
    if (saveState === 'saved') return 'salvo';
    return 'autosave ativo';
  };

  const set = <K extends keyof Task>(key: K, value: Task[K]) =>
    setEditing((cur) => ({ ...cur, [key]: value }));

  // Painéis compartilhados pelo modal atual e pelo modal novo (beta)
  const jsxHistorico = (
              <div className="tmodal-thread">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-start gap-2 text-xs py-1.5 border-b border-line last:border-0"
                  >
                    <span className="font-mono text-muted shrink-0">{fmtPostedEm(h.occurred_at)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-ink">
                        {h.actor_pessoa_id
                          ? pessoasById.get(h.actor_pessoa_id)?.nome ?? '—'
                          : h.actor_source === 'salesforce'
                            ? 'Salesforce'
                            : '—'}
                      </span>
                      {h.field === 'lembrete_homologacao' ? (
                        <span className="text-muted"> lembrou o cliente da homologação</span>
                      ) : h.field === 'status' ? (
                        <span>
                          <span className="text-muted"> moveu </span>
                          <span className="font-medium">{h.from_value ? lblStatus(h.from_value) : '∅'}</span>
                          <span className="text-muted"> → </span>
                          <span className="font-medium">{lblStatus(h.to_value)}</span>
                        </span>
                      ) : (
                        <span>
                          <span className="text-muted"> mudou </span>
                          <span className="font-medium">{labelField(h.field)}</span>
                          <span className="text-muted"> de </span>
                          <span className="font-medium">{formatFieldValue(h.field, h.from_value, pessoasById)}</span>
                          <span className="text-muted"> → </span>
                          <span className="font-medium">{formatFieldValue(h.field, h.to_value, pessoasById)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {!editing.id && (
                  <div className="text-xs text-muted italic py-3">Histórico aparece após salvar a tarefa.</div>
                )}
                {editing.id && history.length === 0 && (
                  <div className="text-xs text-muted italic py-3">Sem histórico ainda.</div>
                )}
              </div>
  );
  const jsxAnexos = (
              <div className="tmodal-thread">
                {!editing.id ? (
                  <div className="text-xs text-muted italic py-3">Anexos aparecem após salvar a tarefa.</div>
                ) : (
                  <div className="flex flex-col gap-3 py-1">
                    <div className="text-[11px] text-muted leading-snug">
                      Cole imagens com <span className="font-mono">⌘V / Ctrl+V</span> em qualquer lugar do modal · PNG / JPG / WebP até 2MB · redimensionadas pra 1600px.
                    </div>
                    {attachmentUploading && (
                      <div className="text-xs text-muted flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full bg-brand animate-pulse" />
                        <span>{attachmentUploadLabel || 'enviando…'}</span>
                      </div>
                    )}
                    {attachments.length === 0 && !attachmentUploading && (
                      <div className="text-xs text-muted italic">Nenhum anexo ainda. Tire um print e cole aqui.</div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {attachments.map((a) => (
                        <div
                          key={a.id}
                          className="relative group border border-line rounded-md overflow-hidden bg-surface-2 aspect-square flex items-center justify-center"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attachmentUrls[a.id]}
                            alt={a.storage_path}
                            className="w-full h-full object-cover cursor-zoom-in"
                            onClick={() => setLightboxAttachment(a)}
                            loading="lazy"
                          />
                          {/* Origem e visibilidade: da conversa ou solta; cliente vê ou não */}
                          <div className="absolute left-1 top-1 flex gap-1 pointer-events-none">
                            {a.visivel_cliente && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[color:var(--green-action)] text-white">externo</span>
                            )}
                            {a.comment_id && (
                              <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-black/55 text-white">conversa</span>
                            )}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[10px] px-1.5 py-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                            <span className="font-mono truncate">
                              {a.width && a.height ? `${a.width}×${a.height} · ` : ''}
                              {fmtBytes(a.size_bytes)}
                            </span>
                            {(isAdmin || (currentPessoa && a.author_pessoa_id === currentPessoa.id)) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAttachment(a);
                                }}
                                className="hover:text-danger ml-1"
                                title="Excluir anexo"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
  );
  // ============ Modal novo (beta) · conversa estilo portal ============
  // Mais antiga em cima, mais recente embaixo (rolagem ancorada no fim).
  // Resposta cita a original, como no WhatsApp; respostas de respostas
  // apontam para a mensagem raiz (o banco não aceita aninhar).
  const conversaAsc = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          new Date(a.posted_em || a.criado_em).getTime() - new Date(b.posted_em || b.criado_em).getTime(),
      ),
    [comments],
  );
  const comentarioPorId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  const conversaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = conversaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);
  const respondendo = replyingToId ? comentarioPorId.get(replyingToId) ?? null : null;
  const enviarConversaV2 = useCallback(() => {
    if (replyingToId && imagensMsg.length === 0) {
      const corpo = newComment;
      if (!corpo.trim()) return;
      setNewComment('');
      submitReply(replyingToId, corpo);
      return;
    }
    setReplyingToId('');
    postComment();
  }, [replyingToId, imagensMsg.length, newComment, submitReply, postComment]);

  const KIND_TAG_INTERNO: Record<string, string> = {
    pendencia: 'Pergunta ao cliente',
    resposta_pendencia: 'Resposta à pendência',
    pedido_prioridade: 'Pedido de prioridade',
    resposta_prioridade: 'Resposta ao pedido de prioridade',
    ajuste_solicitado: 'Pedido de ajuste',
  };

  // Campo da conversa: cresce com o texto até 5 linhas e encolhe ao apagar.
  // A alça na borda de cima fixa uma altura maior (lembrada no navegador);
  // duplo clique volta ao automático.
  const [alturaManual, setAlturaManual] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem('k360-composer-altura'));
      return v > 38 ? v : null;
    } catch {
      return null;
    }
  });
  useLayoutEffect(() => {
    const el = newCommentRef.current;
    if (!el || !el.closest('.m2-composer')) return;
    const AUTO_MAX = 118; // 5 linhas de 20px + 18px de respiro
    el.style.height = 'auto';
    const h = Math.max(alturaManual ?? 38, Math.min(el.scrollHeight, AUTO_MAX));
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > h ? 'auto' : 'hidden';
  }, [newComment, alturaManual]);
  const arrastarComposer = (ev: React.PointerEvent<HTMLDivElement>) => {
    const ta = newCommentRef.current;
    if (!ta) return;
    ev.preventDefault();
    const alca = ev.currentTarget;
    alca.setPointerCapture(ev.pointerId);
    const y0 = ev.clientY;
    const h0 = ta.getBoundingClientRect().height;
    const maxH = Math.max(160, Math.round(window.innerHeight * 0.5));
    let h = h0;
    const mover = (e: PointerEvent) => {
      h = Math.min(maxH, Math.max(38, Math.round(h0 + (y0 - e.clientY))));
      setAlturaManual(h > 40 ? h : null);
    };
    const soltar = () => {
      alca.removeEventListener('pointermove', mover);
      alca.removeEventListener('pointerup', soltar);
      alca.removeEventListener('pointercancel', soltar);
      try {
        if (h > 40) localStorage.setItem('k360-composer-altura', String(h));
        else localStorage.removeItem('k360-composer-altura');
      } catch { /* sem storage */ }
    };
    alca.addEventListener('pointermove', mover);
    alca.addEventListener('pointerup', soltar);
    alca.addEventListener('pointercancel', soltar);
  };
  const resetarComposer = () => {
    setAlturaManual(null);
    try { localStorage.removeItem('k360-composer-altura'); } catch { /* sem storage */ }
  };

  const jsxConversaV2 = (
    <>
      <AnexosMsgContext.Provider value={anexosMsgCtx}>
        <div
          className="pmodal-convo m2-convo"
          ref={(el) => {
            if (el && conversaRef.current !== el) {
              conversaRef.current = el;
              el.scrollTop = el.scrollHeight;
            }
          }}
        >
          {!editing.id && <div className="pmodal-empty">Comentários aparecem após salvar a tarefa.</div>}
          {editing.id && conversaAsc.length === 0 && <div className="pmodal-empty">Nenhuma mensagem ainda.</div>}
          {conversaAsc.map((c) => {
            if (c.kind === 'aprovacao') {
              return (
                <div key={c.id} className="pmodal-sep is-ok">
                  <span />
                  <Icon name="check" size={12} /> Entrega aprovada por {c.author ?? 'cliente'} · {fmtPostedEm(c.posted_em || c.criado_em)}
                  <span />
                </div>
              );
            }
            const doCliente = !!c.from_cliente;
            const externo = !!c.external_source;
            const autor = !!currentPessoa && c.author_pessoa_id === currentPessoa.id;
            const podeEditar = !externo && !doCliente && autor;
            const podeExcluir = !externo && (isAdmin || autor);
            const podeVisibilidade = !externo && !doCliente && (isAdmin || autor);
            const original = c.parent_id ? comentarioPorId.get(c.parent_id) : undefined;
            const tag = c.kind ? KIND_TAG_INTERNO[c.kind] : null;
            const editando = editingCommentId === c.id;
            return (
              <div
                key={c.id}
                className={`pmodal-msg ${doCliente ? 'is-cliente' : 'is-time'} ${c.kind ? `kind-${c.kind}` : ''}`}
              >
                <div className="pmodal-msg-meta">
                  <b>{c.author || (doCliente ? 'Cliente' : 'Time')}</b> · {fmtPostedEm(c.posted_em || c.criado_em)}
                  {c.edited_em && ' · editada'}
                  {c.external_source === 'salesforce' && <span className="m2-vis-tag" aria-pressed="false">SF</span>}
                  {!doCliente && (
                    podeVisibilidade ? (
                      <button
                        type="button"
                        className="m2-vis-tag"
                        aria-pressed={!!c.visivel_cliente}
                        onClick={() => toggleCommentVisivel(c)}
                        title={c.visivel_cliente ? 'O cliente vê esta mensagem' : 'Só o time vê esta mensagem'}
                      >
                        {c.visivel_cliente ? 'Externo' : 'Interno'}
                      </button>
                    ) : (
                      <span className="m2-vis-tag" aria-pressed={!!c.visivel_cliente}>
                        {c.visivel_cliente ? 'Externo' : 'Interno'}
                      </span>
                    )
                  )}
                </div>
                <div className="pmodal-msg-body">
                  {original && (
                    <div className="pmodal-msg-quote">
                      <b>{original.author || (original.from_cliente ? 'Cliente' : 'Time')}</b>
                      <span>{original.body}</span>
                    </div>
                  )}
                  {tag && <div className="pmodal-msg-tag">{tag}</div>}
                  {editando ? (
                    <div className="flex flex-col gap-1.5">
                      <textarea
                        className="inp resize-y min-h-[60px] text-sm"
                        value={editingCommentDraft}
                        onChange={(e) => setEditingCommentDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            e.preventDefault();
                            saveEditComment(c.id);
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingCommentId('');
                            setEditingCommentDraft('');
                          }
                        }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button type="button" className="m2-link" onClick={() => { setEditingCommentId(''); setEditingCommentDraft(''); }}>
                          Cancelar
                        </button>
                        <button type="button" className="m2-btn primario" disabled={!editingCommentDraft.trim()} onClick={() => saveEditComment(c.id)}>
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body, internalFirstNames) }} />
                  )}
                  <ImagensDaMensagem commentId={c.id} />
                </div>
                {!editando && (
                  <div className="m2-macoes">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToId(c.parent_id || c.id);
                        newCommentRef.current?.focus();
                      }}
                    >
                      Responder
                    </button>
                    {podeEditar && (
                      <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentDraft(c.body); }}>
                        Editar
                      </button>
                    )}
                    {podeExcluir && (
                      <button type="button" className="perigo" onClick={() => deleteComment(c)}>
                        Excluir
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AnexosMsgContext.Provider>
      {editing.id && (
        <div className="tmodal-composer m2-composer relative">
          <div
            className="m2-composer-alca"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Arraste para aumentar o campo"
            title="Arraste para aumentar · duplo clique volta ao automático"
            onPointerDown={arrastarComposer}
            onDoubleClick={resetarComposer}
          />
          {respondendo && (
            <div className="m2-respondendo">
              <span>
                Respondendo a <b>{respondendo.author || 'mensagem'}</b>: {respondendo.body.slice(0, 80)}
              </span>
              <button type="button" aria-label="Cancelar resposta" onClick={() => setReplyingToId('')}>×</button>
            </div>
          )}
          <ImagensPendentes
            arquivos={imagensMsg}
            onRemover={(i) => setImagensMsg((cur) => cur.filter((_, j) => j !== i))}
          />
          <div className="tmodal-composer-pill">
            <BotaoAnexarImagem
              quantidadeAtual={imagensMsg.length}
              onEscolher={(novas) => setImagensMsg((cur) => juntarPendentes(cur, novas))}
            />
            <textarea
              ref={newCommentRef}
              value={newComment}
              onChange={mentionPicker.onChange}
              onPaste={(e) => {
                const imgs = imagensDoClipboard(e);
                if (!imgs.length) return;
                e.preventDefault();
                e.stopPropagation();
                setImagensMsg((cur) => juntarPendentes(cur, imgs));
              }}
              rows={1}
              placeholder={isMobileVp ? '@ para mencionar' : `@ para mencionar · cole print (${atalhoColar()}) · ⌘↵ envia`}
              onKeyDown={(e) => {
                if (mentionPicker.onKeyDown(e)) return;
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  enviarConversaV2();
                } else if (e.key === 'Escape' && replyingToId) {
                  e.stopPropagation();
                  setReplyingToId('');
                }
              }}
            />
            <button
              type="button"
              className="tmodal-composer-send"
              onClick={enviarConversaV2}
              disabled={!newComment.trim() && imagensMsg.length === 0}
              title="Enviar (⌘↵)"
              aria-label="Enviar comentário"
            >
              <Icon name="send" size={14} />
            </button>
          </div>
          <MentionDropdown picker={mentionPicker} />
        </div>
      )}
    </>
  );

  // ============ Modal novo (beta) ============
  // Transição explícita (homologação, bloqueio, desbloqueio): aplica o
  // patch, salva na hora e, se vier mensagem, grava na conversa. Se o
  // salvamento falhar (gate da etapa), volta ao estado anterior.
  const aplicarTransicao = useCallback(
    async (
      patch: Partial<Task>,
      opts?: { mensagem?: { body: string; visivel: boolean }; motivoBloqueio?: string },
    ): Promise<boolean> => {
      const antes = editingRef.current;
      const next = { ...antes, ...patch };
      editingRef.current = next;
      skipNextDirty.current = true;
      setEditing(next);
      if (opts?.motivoBloqueio !== undefined) {
        bloqueioMotivoRef.current = opts.motivoBloqueio;
        setBloqueioMotivo(opts.motivoBloqueio);
      }
      if (!next.id) return true;
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      setSaveState('saving');
      const res = await persist({ silent: true });
      if (!res.ok) {
        editingRef.current = antes;
        skipNextDirty.current = true;
        setEditing(antes);
        if (opts?.motivoBloqueio !== undefined) {
          bloqueioMotivoRef.current = '';
          setBloqueioMotivo('');
        }
        setSaveState(clienteWebhookEnabled ? 'off' : 'idle');
        toast.error(res.error ?? 'Erro ao salvar.');
        return false;
      }
      setSaveState(clienteWebhookEnabled ? 'off' : 'saved');
      markUserEditedTask(next.id);
      track('modal_transicao', { task_id: next.id, props: { para: next.subetapa, com_mensagem: !!opts?.mensagem } });
      if (opts?.mensagem) {
        const nowIso = new Date().toISOString();
        const { data: c, error } = await sb
          .from('task_comments')
          .insert({
            task_id: next.id,
            body: opts.mensagem.body,
            author: currentPessoa?.nome ?? 'app',
            author_pessoa_id: currentPessoa?.id ?? null,
            visivel_cliente: opts.mensagem.visivel,
            from_cliente: false,
            posted_em: nowIso,
          })
          .select('*')
          .single();
        if (error) toast.error('A etapa mudou, mas a mensagem não foi gravada: ' + error.message);
        else if (c) setComments((cur) => [...cur, c as Comment]);
      }
      return true;
    },
    [persist, sb, toast, markUserEditedTask, currentPessoa?.id, currentPessoa?.nome, clienteWebhookEnabled],
  );

  const lembrarCliente = useCallback(async () => {
    if (!editing.id) return;
    const { data, error } = await sb.rpc('app_lembrar_homologacao', { p_task_id: editing.id });
    if (error) {
      toast.error('Não foi possível lembrar o cliente: ' + error.message);
      return;
    }
    const r = (data ?? {}) as { ok?: boolean; motivo?: string };
    if (r.ok) {
      toast.success('Lembrete enviado ao cliente pelo portal.');
      track('lembrar_homologacao', { task_id: editing.id });
      const agora = new Date().toISOString();
      setHistory((cur) => [
        {
          id: `tmp-lembrete-${agora}`,
          field: 'lembrete_homologacao',
          from_value: null,
          to_value: 'enviado',
          actor_pessoa_id: currentPessoa?.id ?? null,
          actor_source: 'app',
          occurred_at: agora,
        },
        ...cur,
      ]);
    } else if (r.motivo === 'ja_lembrado_hoje') {
      toast.info('O cliente já foi avisado nas últimas horas. Dá para lembrar de novo amanhã.');
    } else {
      toast.info('Esta tarefa não está aguardando homologação do cliente.');
    }
  }, [editing.id, sb, toast, currentPessoa?.id]);

  const lancarHoras = useCallback(
    async (inicio: Date, fim: Date, nota: string): Promise<boolean> => {
      if (!editing.id) return false;
      const horas = Math.round(((fim.getTime() - inicio.getTime()) / 3_600_000) * 100) / 100;
      try {
        await insertManualEntry(editing.id, inicio, fim, nota || undefined);
        track('timer_manual', { task_id: editing.id, props: { origem: 'modal_novo', horas } });
        toast.success(`${String(horas).replace('.', ',')} h lançadas.`);
        return true;
      } catch (err) {
        toast.error('Erro ao lançar horas: ' + (err as Error).message);
        return false;
      }
    },
    [editing.id, insertManualEntry, toast],
  );

  const horasLancadas = useMemo(
    () => (editing.id ? sumTimeEntriesHours(timeEntries.filter((te) => te.taskId === editing.id)) : 0),
    [editing.id, timeEntries],
  );

  const jsxPedidoBanner = editing.id && live?.prioridadePedidoEm ? (
    <PedidoPrioridadeBanner
      key={live.prioridadePedidoEm}
      prioridadeAtual={editing.prioridade}
      solicitada={live.prioridadePedida ?? null}
      pedidoEm={live.prioridadePedidoEm}
      ate={live.prioridadePedidoAte}
      pedido={[...comments].reverse().find((c) => c.kind === 'pedido_prioridade') ?? null}
      onResponder={responderPedidoPrioridade}
    />
  ) : null;

  const jsxLightbox = lightboxAttachment ? (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 anexo-lightbox"
      onClick={() => setLightboxAttachment(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachmentUrls[lightboxAttachment.id]}
        alt={lightboxAttachment.storage_path}
        className="max-w-full max-h-full object-contain"
      />
    </div>
  ) : null;

  return (
    <TaskModalV2
      editing={editing}
      set={set}
      setCliente={(v) => setEditing((cur) => ({ ...cur, clienteId: v, projetoId: v ? cur.projetoId : '' }))}
      live={live ?? null}
      descricaoLoading={descricaoLoading}
      wasConcluido={wasConcluido}
      missingFields={missingFields}
      saveState={saveState}
      autosaveLabel={autosaveLabel()}
      clientesAtivos={clientesAtivos}
      projetosDoCliente={projetosDoCliente}
      pessoasNaoCliente={pessoasNaoCliente}
      clientesById={clientesById}
      projetosById={projetosById}
      pessoasById={pessoasById}
      tasks={tasks}
      tasksById={tasksById}
      isAdmin={isAdmin}
      isCEO={isCEO}
      podeCronometrar={!!currentPessoa}
      history={history}
      nComentarios={comments.length}
      nAnexos={attachments.length}
      jsxConversa={jsxConversaV2}
      jsxAnexos={jsxAnexos}
      imagensNova={imagensNova}
      setImagensNova={setImagensNova}
      jsxHistorico={jsxHistorico}
      jsxTimesheet={editing.id ? <TimesheetTab taskId={editing.id} /> : null}
      jsxChecklist={<ChecklistEditor items={editing.checklist} onChange={(next) => set('checklist', next)} />}
      pedidoBanner={jsxPedidoBanner}
      lightbox={jsxLightbox}
      horasLancadas={horasLancadas}
      activeEntry={activeEntry}
      elapsed={elapsed}
      timerOcupado={starting || stopping}
      onPlay={() => {
        track('timer_start', { task_id: editing.id, props: { origem: 'modal_novo' } });
        startTimer(editing.id);
      }}
      onStop={async (nota) => {
        track('timer_stop', { props: { origem: 'modal_novo', com_nota: !!nota } });
        await stopTimer(nota);
      }}
      onLancar={lancarHoras}
      onTransicao={aplicarTransicao}
      onLembrar={lembrarCliente}
      preChecarEtapa={preChecarEtapa}
      onToggleRadar={toggleRadar}
      onArquivar={arquivarTask}
      onDesarquivar={desarquivarTask}
      onExcluir={deleteTask}
      onFechar={() => close()}
      onFecharForcado={() => close({ force: true })}
      onSalvar={saveManual}
      onPaste={onModalPaste}
    />
  );
}

// ============================================================
// Sub-componentes
// ============================================================

/**
 * Bucket V · M.4 · Footer reorganizado · destrutivos isolados num
 * menu ··· pra evitar clique acidental. Excluir tem confirmação
 * dupla inline (não usa window.confirm).
 */
// ============================================================
// PedidoPrioridadeBanner · cliente pediu prioridade pelo portal
// ============================================================

function PedidoPrioridadeBanner({
  prioridadeAtual,
  solicitada,
  pedidoEm,
  ate,
  pedido,
  onResponder,
}: {
  prioridadeAtual: string;
  solicitada: string | null;
  pedidoEm: number;
  ate: string | null;
  pedido: Comment | null;
  onResponder: (novaPrio: string, resposta: string, novoPrazo?: string | null) => Promise<boolean>;
}) {
  const nivel = solicitada === 'urgente' ? 'urgente' : 'alta';
  const rotulo = nivel === 'urgente' ? 'Urgente' : 'Alta';
  const alvo = nivel === 'urgente' ? 'P0' : 'P1';
  // Já atende (ex.: pediu alta e está em P0) → aceitar mantém a atual
  const novaPrio = prioridadeAtual === 'P0' || prioridadeAtual === alvo ? prioridadeAtual : alvo;
  // "Pediu prioridade alta até 20/10/2026: motivo" → só o motivo
  const motivo = pedido?.body ? pedido.body.replace(/^Pediu prioridade[^:]*:\s*/, '') : '';
  const [recusando, setRecusando] = useState(false);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [enviando, setEnviando] = useState(false);

  const aceitar = async () => {
    if (enviando) return;
    setEnviando(true);
    const msg =
      `Pedido aceito: prioridade ${rotulo.toLowerCase()}` + (ate ? `, com prazo para ${fmtDate(ate)}.` : '.');
    await onResponder(novaPrio, msg, ate);
    setEnviando(false);
  };
  const recusar = async () => {
    if (!motivoRecusa.trim() || enviando) return;
    setEnviando(true);
    await onResponder(prioridadeAtual, motivoRecusa.trim());
    setEnviando(false);
  };

  const quando = new Date(pedidoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="tmodal-pedido-prio">
      <div className="tmodal-pedido-prio-head">
        <Icon name="arrow-up" size={16} />
        <span className="grow">Cliente pediu prioridade {rotulo.toLowerCase()}</span>
        <span className="font-mono text-[11px]">{quando}</span>
      </div>
      <div className="tmodal-pedido-prio-body">
        <div className="tmodal-pedido-prio-grid">
          <span className="lbl">Pedido por</span>
          <span className="font-semibold text-ink">{pedido?.author ?? 'Cliente'}</span>
          <span className="lbl">Nova prioridade</span>
          <span>
            {rotulo} <span className="font-mono text-muted">({novaPrio})</span>
            {prioridadeAtual && prioridadeAtual !== novaPrio && (
              <span className="text-muted"> · hoje {prioridadeAtual}</span>
            )}
          </span>
          {ate && (
            <>
              <span className="lbl">Novo prazo</span>
              <span className="font-mono">{fmtDate(ate)}</span>
            </>
          )}
          {motivo && (
            <>
              <span className="lbl">O que mudou</span>
              <span className="whitespace-pre-wrap break-words">{motivo}</span>
            </>
          )}
        </div>

        {recusando ? (
          <div className="flex flex-col gap-2">
            <label className="lbl" htmlFor="recusa-pedido-prio">
              Motivo da recusa <span className="text-muted font-normal normal-case">vai para a conversa do cliente</span>
            </label>
            <textarea
              id="recusa-pedido-prio"
              className="inp"
              rows={2}
              value={motivoRecusa}
              onChange={(e) => setMotivoRecusa(e.target.value)}
              placeholder="Explique por que a prioridade fica como está e, se possível, uma previsão."
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setRecusando(false)} disabled={enviando}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={!motivoRecusa.trim() || enviando}
                onClick={recusar}
              >
                {enviando ? 'Enviando…' : 'Recusar pedido'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setRecusando(true)} disabled={enviando}>
              Recusar
            </button>
            <button type="button" className="btn btn-primary" onClick={aceitar} disabled={enviando}>
              <Icon name="check" size={14} />
              {enviando ? 'Aceitando…' : `Aceitar · ${novaPrio}${ate ? ` até ${fmtDate(ate)}` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TimesheetTab({ taskId, onLoaded }: { taskId: string; onLoaded?: (n: number) => void }) {
  const { currentPessoa, viewerRole } = useData();
  const { activeEntry } = useTimer();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loadingTime, setLoadingTime] = useState(true);
  // Per-row pending delete · clica X uma vez vira "Confirmar?" inline,
  // segundo clique deleta. ESC ou click fora limpa via window listener.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPendingDelete(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingDelete]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('time_entries')
      .select('*')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        const mapped = (data ?? []).map(timeEntryFromDb);
        setEntries(mapped);
        setLoadingTime(false);
        onLoaded?.(mapped.length);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // Refresh when active timer stops
  useEffect(() => {
    if (!activeEntry) {
      const supabase = createClient();
      supabase
        .from('time_entries')
        .select('*')
        .eq('task_id', taskId)
        .order('started_at', { ascending: false })
        .then(({ data }) => {
          if (data) {
            const mapped = data.map(timeEntryFromDb);
            setEntries(mapped);
            onLoaded?.(mapped.length);
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntry]);

  async function deleteEntry(id: string) {
    const supabase = createClient();
    await supabase.from('time_entries').delete().eq('id', id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const totalMs = entries.reduce((acc, e) => {
    if (!e.endedAt) return acc + (Date.now() - e.startedAt);
    return acc + (e.endedAt - e.startedAt);
  }, 0);

  const canDelete = (e: TimeEntry) =>
    viewerRole === 'admin' || e.pessoaId === currentPessoa?.id;

  function fmtTime(ms: number) {
    const d = new Date(ms);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(ms: number) {
    const d = new Date(ms);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  if (loadingTime) {
    return <div className="tmodal-thread"><p className="text-xs text-muted text-center py-6">carregando…</p></div>;
  }

  return (
    <div className="tmodal-thread">
      {/* Total */}
      <div className="flex items-center justify-between px-1 py-2 border-b border-line mb-1">
        <span className="text-xs font-medium text-ink">Total registrado</span>
        <span className="text-sm font-mono font-semibold text-brand">{fmtDuration(totalMs)}</span>
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-muted text-center py-6">Nenhum registro de tempo ainda.</p>
      )}

      {entries.map((e) => {
        const durMs = e.endedAt ? e.endedAt - e.startedAt : Date.now() - e.startedAt;
        const isRunning = !e.endedAt;
        return (
          <div key={e.id} className="py-2 border-b border-line last:border-0">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted font-mono shrink-0 w-10">{fmtDay(e.startedAt)}</span>
              <span className="text-muted font-mono shrink-0">
                {fmtTime(e.startedAt)} – {e.endedAt ? fmtTime(e.endedAt) : (
                  <span className="text-[color:var(--brand)]">em andamento</span>
                )}
              </span>
              <span className={`font-mono font-medium ml-auto shrink-0 ${isRunning ? 'text-[color:var(--brand)]' : 'text-ink'}`}>
                {fmtDuration(durMs)}
              </span>
              {canDelete(e) && !isRunning && (
                pendingDelete === e.id ? (
                  <span className="ml-1 shrink-0 inline-flex items-center gap-1">
                    <button
                      type="button"
                      className="text-[10px] uppercase font-bold text-[color:var(--danger)] hover:underline"
                      onClick={async () => {
                        setPendingDelete(null);
                        await deleteEntry(e.id);
                      }}
                      title="Confirmar exclusão"
                    >
                      excluir
                    </button>
                    <button
                      type="button"
                      className="text-[10px] uppercase font-bold text-muted hover:text-ink"
                      onClick={() => setPendingDelete(null)}
                      title="Cancelar"
                    >
                      cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-muted hover:text-danger ml-1 shrink-0"
                    onClick={() => setPendingDelete(e.id)}
                    title="Excluir registro"
                  >
                    ×
                  </button>
                )
              )}
            </div>
            {e.note && (
              <p className="text-xs text-muted italic mt-0.5 pl-[3.5rem] truncate">{e.note}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (next: ChecklistItem[]) => void;
}) {
  // Refs por item — usadas pra focar a linha recém-criada via Enter.
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  // Index da linha que pediu foco no próximo render (após onChange tomar efeito).
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocus.current == null) return;
    const idx = pendingFocus.current;
    pendingFocus.current = null;
    const el = inputsRef.current[idx];
    if (el) el.focus();
  });

  const add = (at?: number) => {
    const item: ChecklistItem = {
      id: 'cli-' + Math.random().toString(36).slice(2, 9),
      body: '',
      done: false,
    };
    const idx = typeof at === 'number' ? at : items.length;
    const next = [...items];
    next.splice(idx, 0, item);
    pendingFocus.current = idx;
    onChange(next);
  };
  const remove = (idx: number) => {
    const next = items.slice();
    next.splice(idx, 1);
    onChange(next);
  };
  const update = (idx: number, patch: Partial<ChecklistItem>) => {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-1.5 mt-1">
      {items.map((item, idx) => (
        <div key={item.id ?? idx} className="flex items-start gap-2 group">
          <input
            type="checkbox"
            className="mt-1.5 cursor-pointer flex-shrink-0"
            checked={item.done}
            onChange={(e) => update(idx, { done: e.target.checked })}
          />
          <input
            ref={(el) => {
              inputsRef.current[idx] = el;
            }}
            type="text"
            className={`checklist-line text-sm flex-1 ${item.done ? 'opacity-60 line-through' : ''}`}
            value={item.body}
            onChange={(e) => update(idx, { body: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add(idx + 1);
              } else if (e.key === 'Backspace' && !item.body) {
                e.preventDefault();
                remove(idx);
              } else if (e.key === 'Escape') {
                // ESC numa linha vazia: remove (e impede fechamento do modal).
                // ESC com texto: só sai do input (blur), próximo ESC fecha o modal.
                e.stopPropagation();
                if (!item.body) {
                  e.preventDefault();
                  remove(idx);
                } else {
                  (e.target as HTMLInputElement).blur();
                }
              }
            }}
            placeholder="mini-task…"
          />
          <button
            className="text-muted hover:text-danger text-xs px-1 opacity-0 group-hover:opacity-100 transition"
            onClick={() => remove(idx)}
            title="Remover"
            tabIndex={-1}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="text-xs text-muted hover:text-ink self-start py-1" onClick={() => add()}>
        + adicionar item
      </button>
    </div>
  );
}

// ============================================================
// History formatters
// ============================================================
function labelField(f: string): string {
  return (
    (
      {
        prazo: 'prazo',
        esforco: 'esforço',
        prioridade: 'prioridade',
        complexidade: 'complexidade',
        pessoa: 'responsável',
        subetapa: 'etapa',
        escopo: 'escopo',
        tempo_real_horas: 'tempo real',
        bloqueado_por: 'bloqueado por',
      } as Record<string, string>
    )[f] ?? f
  );
}

function formatFieldValue(
  field: string,
  v: string | null,
  pessoasById: Map<string, { nome: string }>,
): string {
  if (v == null || v === '') return '∅';
  if (field === 'prazo') return fmtDate(v);
  if (field === 'pessoa') return pessoasById.get(v)?.nome ?? '—';
  if (field === 'esforco' || field === 'tempo_real_horas') return v + 'h';
  return String(v);
}
