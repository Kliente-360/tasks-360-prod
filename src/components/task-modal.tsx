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
  useMemo,
  useRef,
  useState,
} from 'react';
import { useData, useClientesById, useProjetosById, usePessoasById, useProjetosByCliente, useTasksById } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { createClient } from '@/lib/supabase/client';
import { fmtBytes, fmtPostedEm, renderCommentBody } from '@/lib/format';
import { fmtDate, fmtDateShort, lblStatus } from '@/lib/task-utils';
import { SUB_TO_MACRO, SKILL_GROUPS, ALL_SKILLS } from '@/lib/task-constants';
import { timeEntryFromDb } from '@/lib/adapters';
import { fmtDuration, useTimer } from '@/lib/use-timer';
import type { ChecklistItem, Task, TimeEntry } from '@/lib/types';

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

type Attachment = {
  id: string;
  task_id: string;
  storage_path: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  author_pessoa_id: string | null;
  criado_em: string;
};

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
// SVG do ícone "copiar" — Feather Icons copy. Pixel-perfect com Alpine
// index.html:3562. Convenção do projeto: ícones em SVG inline, nunca emoji.
function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function blankEditing(): Task {
  return {
    id: '',
    titulo: '',
    descricao: '',
    clienteId: '',
    projetoId: '',
    pessoaId: '',
    prioridade: 'P2',
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
    tags: [],
    checklist: [],
    reopenCount: 0,
    escopo: [],
    tempoRealHoras: null,
    externalSource: '',
    externalId: '',
    arquivadoEm: null,
    criadoPorIa: false,
    triadaEm: null,
    triadaPor: null,
    motivoArquivamento: null,
    privada: false,
    webhookSyncStatus: '',
    webhookSyncError: '',
  };
}

/** Converte editing → payload snake_case pra UPDATE/INSERT no Postgres. */
function editingToDbPayload(e: Task): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    titulo: e.titulo.trim(),
    descricao: e.descricao ?? '',
    cliente_id: e.clienteId || null,
    projeto_id: e.projetoId || null,
    pessoa_id: e.pessoaId || null,
    prioridade: e.prioridade,
    esforco: Number(e.esforco) || 0,
    complexidade: e.complexidade || 'media',
    prazo: e.prazo || null,
    subetapa: e.subetapa || 'backlog',
    status: SUB_TO_MACRO[e.subetapa] || 'backlog',
    bloqueado_por: e.subetapa === 'bloqueado' ? e.bloqueadoPor || null : null,
    visivel_cliente: e.visivelCliente !== false,
    tags: e.tags ?? [],
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
  'id,titulo,cliente_id,projeto_id,pessoa_id,prioridade,esforco,complexidade,prazo,status,subetapa,bloqueado_por,visivel_cliente,criado_em,status_em,subetapa_em,andamento_em,ordem,tags,checklist,reopen_count,escopo,tempo_real_horas,external_source,external_id,arquivado_em,criado_por_ia,triada_em,triada_por,motivo_arquivamento,privada';

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
  pessoas: Array<{ id: string; nome: string; role: string }>,
  excludePessoaId: string | null,
): MentionPickerState {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const anchorRef = useRef<number | null>(null);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    return pessoas
      .filter((p) => p.role !== 'cliente' && p.id !== excludePessoaId)
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
      setIsNew(false);
      setOpenTaskId(taskId);
      syncUrlTaskParam(taskId);
    },
    [syncUrlTaskParam],
  );
  const openNew = useCallback(() => {
    setIsNew(true);
    setOpenTaskId('__new__');
  }, []);
  const close = useCallback(() => {
    setOpenTaskId(null);
    setIsNew(false);
    syncUrlTaskParam(null);
  }, [syncUrlTaskParam]);

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
      {openTaskId !== null && (
        <TaskModal taskId={isNew ? null : openTaskId} onClose={close} />
      )}
    </TaskModalContext.Provider>
  );
}

// ============================================================
// Modal — leva o trabalho pesado
// ============================================================
function TaskModal({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const {
    clientes,
    pessoas,
    patchTask,
    replaceTask,
    upsertTask,
    removeTask,
    currentPessoa,
    viewerRole,
    isCEO,
    markUserEditedTask,
  } = useData();
  const isAdmin = viewerRole === 'admin';
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

  // Subetapa original capturada UMA VEZ quando o modal abre.
  // Não pode ser derivada de `source` porque o autosave atualiza source
  // após 800ms, fazendo isTransitionToBloqueado virar false e o textarea sumir.
  const originalSubetapaRef = useRef(source?.subetapa ?? '');
  const isTransitionToBloqueado =
    editing.subetapa === 'bloqueado' && originalSubetapaRef.current !== 'bloqueado';
  const [bloqueioMotivo, setBloqueioMotivo] = useState('');
  const bloqueioMotivoRef = useRef('');
  bloqueioMotivoRef.current = bloqueioMotivo;

  // ===== Tabs =====
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [modalTab, setModalTab] = useState<'detalhes' | 'conversa' | 'anexos' | 'historico' | 'tempo'>(
    isMobile ? 'detalhes' : 'conversa',
  );
  const [tempoCount, setTempoCount] = useState<number | null>(null);
  const [checklistOpen, setChecklistOpen] = useState<boolean>(
    (source?.checklist?.length ?? 0) > 0,
  );

  // ===== Async data (comments, history, attachments) =====
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  // True enquanto o lazy-load da descrição roda (skeleton no textarea).
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
  const [newCommentPublico, setNewCommentPublico] = useState(false);

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

  // ============ Helpers para resolver entidades ============
  const clientesAtivos = useMemo(() => clientes.filter((c) => !c.arquivadoEm), [clientes]);
  const projetosDoCliente = useMemo(() => {
    if (!editing.clienteId) return [];
    return (projetosByCliente.get(editing.clienteId) ?? []).filter((p) => !p.arquivadoEm);
  }, [editing.clienteId, projetosByCliente]);
  const pessoasNaoCliente = useMemo(
    () => pessoas.filter((p) => p.role !== 'cliente'),
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
      // Lazy descricao se não veio do boot. `undefined` no source = nunca
      // foi carregada (light cols não incluem). `''` ou string = já temos.
      if (editingRef.current.descricao === undefined) {
        const { data } = await sb.from('tasks').select('descricao').eq('id', taskId).single();
        if (!cancelled) {
          setEditing((cur) => ({ ...cur, descricao: data?.descricao ?? '' }));
          setDescricaoLoading(false);
          skipNextDirty.current = true;
        }
      } else {
        if (!cancelled) setDescricaoLoading(false);
      }
      // Comments
      const { data: cdata } = await sb
        .from('task_comments')
        .select(
          'id, parent_id, author, author_external_id, author_pessoa_id, body, posted_em, criado_em, edited_em, external_source, external_id, visivel_cliente, from_cliente',
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
        .select('id, task_id, storage_path, mime, size_bytes, width, height, author_pessoa_id, criado_em')
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
      if (e.subetapa === 'bloqueado' && !e.bloqueadoPor) {
        return { ok: false, error: 'Informe quem está bloqueando (Nós / Cliente / Terceiro).' };
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
            tags: [...e.tags],
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

        // Log de mudanças no histórico (status + field changes)
        if (prev) {
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
            sb.from('notifications').insert(notifRows);
          }

          // Motivo de bloqueio: se é uma transição para 'bloqueado' nesta sessão
          // e o usuário digitou um motivo, insere como comment interno.
          const motivo = bloqueioMotivoRef.current.trim();
          const wasBloqueado = prev?.subetapa === 'bloqueado';
          if (e.subetapa === 'bloqueado' && !wasBloqueado && motivo) {
            const commentPayload = {
              task_id: e.id,
              body: motivo,
              author: currentPessoa?.nome ?? 'app',
              author_pessoa_id: currentPessoa?.id ?? null,
              visivel_cliente: false,
              from_cliente: false,
              posted_em: nowIso,
            };
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
                  visivel_cliente: false,
                  from_cliente: false,
                  external_source: null,
                  external_id: null,
                  posted_em: nowIso,
                  criado_em: nowIso,
                  edited_em: null,
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
    [sb, tasksById, patchTask, replaceTask, upsertTask, currentPessoa?.id, currentPessoa?.nome],
  );

  const autosaveNow = useCallback(async () => {
    const e = editingRef.current;
    if (!e.id) return; // só autosalva tasks já criadas
    if (!e.titulo.trim()) return;
    const seq = ++autosaveSeq.current;
    setSaveState('saving');
    const res = await persist({ silent: true });
    if (seq !== autosaveSeq.current) return;
    if (res.ok) {
      setSaveState('saved');
      // Marca pra o watcher global toastar quando o webhook completar
      // (relevante apenas pra tasks SF — outras nem disparam webhook).
      markUserEditedTask(e.id);
    } else {
      setSaveState('error');
      // eslint-disable-next-line no-console
      console.warn('[autosave]', res.error);
    }
  }, [persist, markUserEditedTask]);
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
  const close = useCallback(async () => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const pending: Promise<unknown>[] = [];
    if (newComment.trim()) pending.push(postComment());
    if (replyingToId && newReply.trim()) pending.push(submitReply(replyingToId));
    if (editingCommentId && editingCommentDraft.trim()) pending.push(saveEditComment(editingCommentId));
    if (saveStateRef.current === 'dirty' && editing.id) pending.push(autosaveNow());
    if (pending.length) {
      try {
        await Promise.all(pending);
      } catch {
        /* segue mesmo com erro — onClose fecha */
      }
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newComment, replyingToId, newReply, editingCommentId, editingCommentDraft, editing.id, autosaveNow, onClose]);

  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxAttachment) setLightboxAttachment(null);
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
          .filter((p) => p.role !== 'cliente')
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
      if (rows.length) sb.from('notifications').insert(rows);
    },
    [editing.id, editing.pessoaId, pessoas, currentPessoa, sb],
  );

  const postComment = useCallback(async () => {
    const body = newComment.trim();
    if (!body || !editing.id) return;
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
  }, [newComment, newCommentPublico, editing.id, sb, currentPessoa, notifyAfterComment, toast]);

  const submitReply = useCallback(
    async (parentId: string) => {
      const body = newReply.trim();
      if (!body || !editing.id || !parentId) return;
      const parent = comments.find((c) => c.id === parentId);
      const visivel = !!parent?.visivel_cliente;
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
  const downscaleImage = (file: File, maxDim: number, quality: number) =>
    new Promise<{ blob: Blob; width: number; height: number } | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outType =
          file.type === 'image/png' && file.size < 800 * 1024 ? 'image/png' : 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            resolve({ blob, width: w, height: h });
          },
          outType,
          quality,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });

  const uploadAttachment = useCallback(
    async (file: File) => {
      if (!editing.id) return;
      setAttachmentUploading(true);
      setAttachmentUploadLabel('processando…');
      try {
        const processed = await downscaleImage(file, 1600, 0.85);
        if (!processed) {
          toast.error('Falha ao processar imagem.');
          return;
        }
        if (processed.blob.size > 2 * 1024 * 1024) {
          toast.error('Imagem ainda acima de 2MB após compressão.');
          return;
        }
        setAttachmentUploadLabel('enviando…');
        const ext =
          processed.blob.type === 'image/png'
            ? 'png'
            : processed.blob.type === 'image/webp'
              ? 'webp'
              : 'jpg';
        const objId = crypto.randomUUID();
        const path = `${editing.id}/${objId}.${ext}`;
        const { error: upErr } = await sb.storage
          .from('task-attachments')
          .upload(path, processed.blob, { contentType: processed.blob.type, upsert: false });
        if (upErr) {
          toast.error('Erro no upload: ' + upErr.message);
          return;
        }
        const { data, error: insErr } = await sb
          .from('task_attachments')
          .insert({
            task_id: editing.id,
            storage_path: path,
            mime: processed.blob.type,
            size_bytes: processed.blob.size,
            width: processed.width,
            height: processed.height,
            author_pessoa_id: currentPessoa?.id ?? null,
          })
          .select(
            'id, task_id, storage_path, mime, size_bytes, width, height, author_pessoa_id, criado_em',
          )
          .single();
        if (insErr || !data) {
          await sb.storage.from('task-attachments').remove([path]);
          toast.error('Erro ao registrar anexo: ' + (insErr?.message ?? 'falha'));
          return;
        }
        setAttachments((cur) => [data as Attachment, ...cur]);
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
      if (idAfter) markUserEditedTask(idAfter);
      onClose();
    } else {
      setSaveState('error');
      toast.error(res.error ?? 'Erro ao salvar.');
    }
  }, [persist, onClose, toast, markUserEditedTask]);

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
  const topLevel = useMemo(
    () =>
      comments
        .filter((c) => !c.parent_id)
        .slice()
        .sort((a, b) => {
          const ta = new Date(a.posted_em || a.criado_em).getTime();
          const tb = new Date(b.posted_em || b.criado_em).getTime();
          return tb - ta;
        }),
    [comments],
  );
  const repliesOf = useCallback(
    (parentId: string) => comments.filter((c) => c.parent_id === parentId),
    [comments],
  );

  const autosaveLabel = (): string => {
    if (saveState === 'off') return 'autosave off';
    if (saveState === 'saving') return 'salvando…';
    if (saveState === 'dirty') return 'editando…';
    if (saveState === 'error') return 'falhou · tentar de novo';
    if (saveState === 'saved') return 'salvo';
    return 'autosave ativo';
  };

  const set = <K extends keyof Task>(key: K, value: Task[K]) =>
    setEditing((cur) => ({ ...cur, [key]: value }));

  // ============ Markup ============
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center modal-bg p-2 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onPaste={onModalPaste}
    >
      <div className="tmodal" role="dialog" aria-label="Editar tarefa">
        {/* Header */}
        <div className="tmodal-head">
          <input
            className="tmodal-title"
            value={editing.titulo}
            onChange={(e) => set('titulo', e.target.value)}
            placeholder="O que precisa ser feito?"
            aria-label="Título da tarefa"
            autoFocus={!editing.id}
          />
          {editing.criadoPorIa && (
            <span className="ia-chip" title="Criada por automação IA">
              🤖 IA
            </span>
          )}
          {editing.prioridade && (
            <span className={`pri pri-${editing.prioridade}`}>
              <span className="pri-dot" />
              {editing.prioridade}
            </span>
          )}
          {editing.prazo && (
            <span className="head-chip" title={`Prazo: ${fmtDate(editing.prazo)}`}>
              <span className="head-chip-ico">⏱</span>
              {fmtDateShort(editing.prazo)}
            </span>
          )}
          {editing.clienteId && (
            <span className="head-chip head-chip-cliente">
              {clientesById.get(editing.clienteId)?.nome ?? ''}
            </span>
          )}
          {!editing.id && !editing.clienteId && (
            <span className="head-chip head-chip-muted">Nova tarefa</span>
          )}
          {editing.id && (editing.reopenCount || 0) > 0 && (
            <span
              className="reopen-chip text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0"
              style={{ background: 'var(--p1-soft)', color: 'var(--p1)' }}
            >
              reaberta {editing.reopenCount}x
            </span>
          )}
          {editing.id && editing.arquivadoEm && (
            <span
              className="arquivada-chip text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
              title="Tarefa arquivada"
            >
              arquivada
            </span>
          )}
          <div className="tmodal-head-right">
            {editing.id && clienteWebhookEnabled && editing.webhookSyncStatus === 'error' && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: 'var(--p0-soft)', color: 'var(--p0)' }}
                title={editing.webhookSyncError || 'Falha ao sincronizar com Salesforce'}
              >
                sync · erro
              </span>
            )}
            {editing.id && clienteWebhookEnabled && editing.webhookSyncStatus === 'synced' && (
              <span
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0"
                style={{ background: 'var(--brand-soft)', color: 'var(--brand-dark)' }}
                title="Último update sincronizado com Salesforce"
              >
                sync · ok
              </span>
            )}
            {editing.id && (
              <span
                className="autosave"
                data-state={saveState}
                title={
                  saveState === 'off'
                    ? 'Autosave desativado pra este cliente — salve manualmente (⌘S)'
                    : saveState === 'error'
                      ? 'Autosave falhou — clique em Salvar'
                      : 'Autosave ativo · ⌘S força salvar'
                }
              >
                <span className="as-dot" />
                {autosaveLabel()}
              </span>
            )}
            {editing.id && (
              <button
                className="icon-btn"
                aria-label="Copiar link desta tarefa"
                title="Copiar link desta tarefa"
                onClick={() => {
                  const sp = new URLSearchParams(window.location.search);
                  sp.set('task', editing.id);
                  const url =
                    window.location.origin +
                    window.location.pathname +
                    '?' +
                    sp.toString();
                  navigator.clipboard.writeText(url).then(
                    () => toast.success('Link copiado!', 2000),
                    () => toast.error('Não foi possível copiar.'),
                  );
                }}
              >
                <CopyIcon />
              </button>
            )}
            <button className="icon-btn" aria-label="Fechar" onClick={close}>
              ×
            </button>
          </div>
        </div>

        {/* Tabs mobile */}
        <div className="tmodal-mobile-tabs">
          {(['detalhes', 'conversa', 'anexos', 'historico', 'tempo'] as const).map((tab) => (
            <div
              key={tab}
              className={`tmtab ${modalTab === tab ? 'active' : ''}`}
              onClick={() => setModalTab(tab)}
            >
              {tab === 'detalhes' && 'Detalhes'}
              {tab === 'conversa' && (
                <>
                  Conversa <span className="count">{comments.length}</span>
                </>
              )}
              {tab === 'anexos' && (
                <>
                  Anexos <span className="count">{attachments.length}</span>
                </>
              )}
              {tab === 'historico' && (
                <>
                  Histórico <span className="count">{history.length}</span>
                </>
              )}
              {tab === 'tempo' && (
                <>Tempo {tempoCount !== null && <span className="count">{tempoCount}</span>}</>
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="tmodal-body">
          {/* LEFT */}
          <div className={`tmodal-left ${isMobile && modalTab !== 'detalhes' ? 'mob-hidden' : ''}`}>
            {/* Atribuição */}
            <div className="tmodal-section">
              <div className="tmodal-section-title">Atribuição</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Cliente</label>
                  <select
                    className="inp"
                    value={editing.clienteId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditing((cur) => ({ ...cur, clienteId: v, projetoId: v ? cur.projetoId : '' }));
                    }}
                  >
                    <option value="">—</option>
                    {clientesAtivos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Projeto</label>
                  <select
                    className="inp"
                    value={editing.projetoId}
                    disabled={!editing.clienteId}
                    onChange={(e) => set('projetoId', e.target.value)}
                  >
                    <option value="">—</option>
                    {projetosDoCliente.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl">Responsável</label>
                  <select
                    className="inp"
                    value={editing.pessoaId}
                    onChange={(e) => set('pessoaId', e.target.value)}
                  >
                    <option value="">—</option>
                    {(() => {
                      const escopo = editing.escopo ?? [];
                      const match = escopo.length > 0
                        ? pessoasNaoCliente.filter((p) => (p.skills ?? []).some((s) => escopo.includes(s)))
                        : [];
                      const rest = pessoasNaoCliente.filter((p) => !match.includes(p));
                      if (match.length === 0) {
                        return rest.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>);
                      }
                      return (
                        <>
                          <optgroup label="✓ Skills compatíveis">
                            {match.map((p) => (
                              <option key={p.id} value={p.id}>{p.nome}</option>
                            ))}
                          </optgroup>
                          {rest.length > 0 && (
                            <optgroup label="Outros">
                              {rest.map((p) => (
                                <option key={p.id} value={p.id}>{p.nome}</option>
                              ))}
                            </optgroup>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>
                <div>
                  <label className="lbl">Prioridade</label>
                  <select
                    className="inp"
                    value={editing.prioridade}
                    onChange={(e) => set('prioridade', e.target.value as Task['prioridade'])}
                  >
                    <option value="P0">P0 · Urgente</option>
                    <option value="P1">P1 · Alta</option>
                    <option value="P2">P2 · Normal</option>
                    <option value="P3">P3 · Baixa</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Descrição */}
            <div className="tmodal-section">
              <div className="tmodal-section-title">Descrição</div>
              <textarea
                className="inp"
                rows={3}
                value={descricaoLoading ? '' : (editing.descricao ?? '')}
                onChange={(e) => set('descricao', e.target.value)}
                placeholder={descricaoLoading ? 'Carregando…' : 'Contexto, links, critérios de aceite…'}
                disabled={descricaoLoading}
                style={descricaoLoading ? { opacity: 0.6 } : undefined}
              />
            </div>

            {/* Checklist */}
            <div className="tmodal-section">
              <div
                className="tmodal-section-title flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setChecklistOpen((v) => !v)}
              >
                <span className="text-muted text-xs font-mono">{checklistOpen ? '▾' : '▸'}</span>
                <span>Checklist</span>
                {editing.checklist.length > 0 && (
                  <span className="text-[10px] text-muted font-mono">
                    {editing.checklist.filter((i) => i.done).length}/{editing.checklist.length}
                  </span>
                )}
              </div>
              {checklistOpen && (
                <ChecklistEditor
                  items={editing.checklist}
                  onChange={(next) => set('checklist', next)}
                />
              )}
            </div>

            {/* Esforço */}
            <div className="tmodal-section">
              <div className="tmodal-section-title">Esforço</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Complexidade</label>
                  <select
                    className="inp"
                    value={editing.complexidade}
                    onChange={(e) => set('complexidade', e.target.value as Task['complexidade'])}
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">Prazo</label>
                  <input
                    type="date"
                    className="inp"
                    value={editing.prazo}
                    onChange={(e) => set('prazo', e.target.value)}
                  />
                </div>
                <div>
                  <label className="lbl">Estimado (h)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="inp"
                    value={editing.esforco}
                    onChange={(e) => set('esforco', Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="lbl">Realizado (h)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="inp"
                    value={editing.tempoRealHoras ?? ''}
                    onChange={(e) =>
                      set('tempoRealHoras', e.target.value === '' ? null : Number(e.target.value))
                    }
                    placeholder="—"
                  />
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="tmodal-section">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="lbl">Etapa</label>
                  <select
                    className="inp"
                    value={editing.subetapa}
                    onChange={(e) => set('subetapa', e.target.value)}
                  >
                    <optgroup label="Backlog">
                      <option value="backlog">Backlog</option>
                      <option value="priorizado">Priorizado</option>
                      <option value="em_definicao">Em definição</option>
                      <option value="escopo_definido">Escopo definido</option>
                    </optgroup>
                    <optgroup label="Em andamento">
                      <option value="em_desenvolvimento">Em desenvolvimento</option>
                      <option value="em_homologacao">Em homologação</option>
                      <option value="em_revisao">Em revisão</option>
                      <option value="pronto_producao">Pronto p/ produção</option>
                      <option value="em_implantacao">Em implantação</option>
                    </optgroup>
                    <optgroup label="Bloqueado">
                      <option value="bloqueado">Bloqueado</option>
                    </optgroup>
                    <optgroup label="Concluído">
                      <option value="concluido">Concluído</option>
                    </optgroup>
                  </select>
                  <div className="text-[10px] text-muted mt-1">
                    macro: <span className="font-mono">{lblStatus(SUB_TO_MACRO[editing.subetapa] || 'backlog')}</span>
                  </div>
                </div>
                <div>
                  <label className="lbl">Visível ao cliente</label>
                  <label
                    className="inp flex items-center gap-2 cursor-pointer select-none"
                    style={{ background: 'var(--bg-elev)' }}
                  >
                    <input
                      type="checkbox"
                      checked={editing.visivelCliente}
                      onChange={(e) => set('visivelCliente', e.target.checked)}
                    />
                    <span className="text-sm">{editing.visivelCliente ? '✓ sim' : '— não'}</span>
                  </label>
                </div>
                {editing.subetapa === 'bloqueado' && (
                  <div className="sm:col-span-2 flex flex-col gap-2">
                    <div>
                      <label className="lbl">
                        Bloqueado por <span className="text-danger text-xs">*</span>
                      </label>
                      <select
                        className={`inp ${!editing.bloqueadoPor ? 'border-danger/50' : ''}`}
                        value={editing.bloqueadoPor}
                        onChange={(e) => set('bloqueadoPor', e.target.value)}
                      >
                        <option value="">— a classificar</option>
                        <option value="cliente">Cliente</option>
                        <option value="nos">Nós (interno)</option>
                        <option value="terceiro">Terceiro</option>
                      </select>
                    </div>
                    {isTransitionToBloqueado && (
                      <div>
                        <label className="lbl">Motivo do bloqueio</label>
                        <textarea
                          className="inp resize-none"
                          rows={2}
                          placeholder="Descreva o motivo (ficará como comentário interno)…"
                          value={bloqueioMotivo}
                          onChange={(e) => setBloqueioMotivo(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Escopo / Skills */}
            <div className="tmodal-section">
              <div className="tmodal-section-title">Escopo</div>
              <div className="flex flex-col gap-2">
                {SKILL_GROUPS.map((g) => (
                  <div key={g.group}>
                    <div className="text-[10px] uppercase tracking-wide text-muted mb-1">{g.group}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.values.map((skill) => {
                        const active = (editing.escopo ?? []).includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => {
                              const cur = editing.escopo ?? [];
                              set('escopo', active ? cur.filter((s) => s !== skill) : [...cur, skill]);
                            }}
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

            {/* Privacidade — só CEO. Task privada fica visível só pra
                pessoa atribuída (regra do banco/RLS futuro). */}
            {isCEO && (
              <div className="tmodal-section">
                <div className="tmodal-section-title">Privacidade</div>
                <label
                  className="inp flex items-center gap-2 cursor-pointer select-none"
                  style={{ background: 'var(--bg-elev)' }}
                >
                  <input
                    type="checkbox"
                    checked={editing.privada}
                    onChange={(e) => set('privada', e.target.checked)}
                  />
                  <span className="text-sm">
                    {editing.privada
                      ? '🔒 task privada — visível só pra você'
                      : '— pública (visível ao time)'}
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div className={`tmodal-right ${isMobile && modalTab === 'detalhes' ? 'mob-hidden' : ''}`}>
            <div className="tmodal-tabs">
              <div
                className={`tmodal-tab ${modalTab === 'conversa' ? 'active' : ''}`}
                onClick={() => setModalTab('conversa')}
              >
                Conversa <span className="count">{comments.length}</span>
              </div>
              <div
                className={`tmodal-tab ${modalTab === 'anexos' ? 'active' : ''}`}
                onClick={() => setModalTab('anexos')}
              >
                Anexos <span className="count">{attachments.length}</span>
              </div>
              <div
                className={`tmodal-tab ${modalTab === 'historico' ? 'active' : ''}`}
                onClick={() => setModalTab('historico')}
              >
                Histórico <span className="count">{history.length}</span>
              </div>
              {editing.id && (
                <div
                  className={`tmodal-tab ${modalTab === 'tempo' ? 'active' : ''}`}
                  onClick={() => setModalTab('tempo')}
                >
                  Tempo {tempoCount !== null && <span className="count">{tempoCount}</span>}
                </div>
              )}
            </div>

            {/* HISTÓRICO */}
            {modalTab === 'historico' && (
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
                      {h.field === 'status' ? (
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
            )}

            {/* ANEXOS */}
            {modalTab === 'anexos' && (
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
            )}

            {/* CONVERSA */}
            {modalTab === 'conversa' && (
              <>
                <div className="tmodal-thread">
                  {topLevel.map((c) => (
                    <CommentItem
                      key={c.id}
                      c={c}
                      replies={repliesOf(c.id)}
                      editingId={editingCommentId}
                      editingDraft={editingCommentDraft}
                      setEditingDraft={setEditingCommentDraft}
                      onStartEdit={(item) => {
                        setEditingCommentId(item.id);
                        setEditingCommentDraft(item.body);
                      }}
                      onCancelEdit={() => {
                        setEditingCommentId('');
                        setEditingCommentDraft('');
                      }}
                      onSaveEdit={saveEditComment}
                      onDelete={deleteComment}
                      onToggleVisivel={toggleCommentVisivel}
                      onStartReply={(id) => {
                        setReplyingToId(id);
                        setNewReply('');
                      }}
                      onCancelReply={() => {
                        setReplyingToId('');
                        setNewReply('');
                      }}
                      onSubmitReply={(id) => submitReply(id)}
                      replyingToId={replyingToId}
                      newReply={newReply}
                      setNewReply={setNewReply}
                      pessoasById={pessoasById}
                      internalFirstNames={internalFirstNames}
                      viewerPessoaId={currentPessoa?.id ?? null}
                      viewerIsAdmin={isAdmin}
                    />
                  ))}
                  {!editing.id && (
                    <div className="text-xs text-muted italic py-3">
                      Comentários aparecem após salvar a tarefa.
                    </div>
                  )}
                  {editing.id && comments.length === 0 && (
                    <div className="text-xs text-muted italic py-3">
                      Sem comentários ainda. Escreva o primeiro abaixo ↓
                    </div>
                  )}
                </div>
                {editing.id && (
                  <div className="tmodal-composer relative">
                    <textarea
                      ref={newCommentRef}
                      value={newComment}
                      onChange={mentionPicker.onChange}
                      placeholder="Escrever comentário… (use @ pra mencionar)"
                      onKeyDown={(e) => {
                        if (mentionPicker.onKeyDown(e)) return;
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          postComment();
                        }
                      }}
                    />
                    <MentionDropdown picker={mentionPicker} />
                    {!newComment && (
                      <div className="tmodal-composer-hint">
                        <kbd>⌘</kbd>
                        <kbd>↵</kbd> envia
                      </div>
                    )}
                    <div className="tmodal-composer-row">
                      <label
                        className={`toggle text-[11px] select-none ${newCommentPublico ? 'text-brand-dark font-medium' : 'text-muted hover:text-ink'}`}
                        title="Marque pra publicar este comentário no Portal do cliente."
                      >
                        <input
                          type="checkbox"
                          checked={newCommentPublico}
                          onChange={(e) => setNewCommentPublico(e.target.checked)}
                        />
                        <span>Visível ao cliente no Portal</span>
                      </label>
                      <div className="spacer" style={{ flex: 1 }} />
                      <button
                        className="btn btn-primary text-xs"
                        onClick={postComment}
                        disabled={!newComment.trim()}
                      >
                        comentar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            {/* TEMPO */}
            {modalTab === 'tempo' && editing.id && (
              <TimesheetTab taskId={editing.id} onLoaded={setTempoCount} />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="tmodal-foot">
          {!editing.id && <span className="hint">tarefa nova · clique em Salvar pra criar</span>}
          <div className="spacer" />
          {editing.id && !editing.arquivadoEm && (
            <button
              className="btn btn-ghost text-xs btn-foot"
              onClick={arquivarTask}
              title="Arquivar (esconder de listas/dashboards/heurísticas)"
            >
              <span className="btn-txt">arquivar</span>
            </button>
          )}
          {editing.id && editing.arquivadoEm && (
            <button className="btn btn-ghost text-xs btn-foot" onClick={desarquivarTask} title="Desarquivar">
              <span className="btn-txt">desarquivar</span>
            </button>
          )}
          {editing.id && isAdmin && (
            <button
              className="btn btn-danger text-xs btn-foot"
              onClick={deleteTask}
              title="Excluir tarefa"
            >
              <span className="btn-txt">excluir</span>
            </button>
          )}
          <button className="btn" onClick={close}>
            fechar
          </button>
          <button className="btn btn-primary" onClick={saveManual}>
            {editing.id ? 'salvar' : 'criar'}
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxAttachment && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxAttachment(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachmentUrls[lightboxAttachment.id]}
            alt={lightboxAttachment.storage_path}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-componentes
// ============================================================

function TimesheetTab({ taskId, onLoaded }: { taskId: string; onLoaded?: (n: number) => void }) {
  const { currentPessoa, viewerRole } = useData();
  const { activeEntry } = useTimer();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loadingTime, setLoadingTime] = useState(true);

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
                <button
                  type="button"
                  className="text-muted hover:text-danger ml-1 shrink-0"
                  onClick={() => deleteEntry(e.id)}
                  title="Excluir registro"
                >
                  ×
                </button>
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

function CommentItem({
  c,
  replies,
  editingId,
  editingDraft,
  setEditingDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleVisivel,
  onStartReply,
  onCancelReply,
  onSubmitReply,
  replyingToId,
  newReply,
  setNewReply,
  pessoasById,
  internalFirstNames,
  viewerPessoaId,
  viewerIsAdmin,
}: {
  c: Comment;
  replies: Comment[];
  editingId: string;
  editingDraft: string;
  setEditingDraft: (s: string) => void;
  onStartEdit: (c: Comment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (c: Comment) => void;
  onToggleVisivel: (c: Comment) => void;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (id: string) => void;
  replyingToId: string;
  newReply: string;
  setNewReply: (s: string) => void;
  pessoasById: Map<string, { nome: string }>;
  internalFirstNames: Set<string>;
  viewerPessoaId: string | null;
  viewerIsAdmin: boolean;
}) {
  const isReplyTo = (replyingToId || '') === c.id;
  return (
    <div>
      <CommentBubble
        c={c}
        editingId={editingId}
        editingDraft={editingDraft}
        setEditingDraft={setEditingDraft}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onSaveEdit={onSaveEdit}
        onDelete={onDelete}
        onToggleVisivel={onToggleVisivel}
        onStartReply={onStartReply}
        internalFirstNames={internalFirstNames}
        pessoasById={pessoasById}
        isReply={false}
        viewerPessoaId={viewerPessoaId}
        viewerIsAdmin={viewerIsAdmin}
      />
      {replies.map((r) => (
        <div key={r.id} style={{ marginLeft: 24, borderLeft: '2px solid var(--line-strong)' }}>
          <CommentBubble
            c={r}
            editingId={editingId}
            editingDraft={editingDraft}
            setEditingDraft={setEditingDraft}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
            onDelete={onDelete}
            onToggleVisivel={onToggleVisivel}
            onStartReply={() => {}}
            internalFirstNames={internalFirstNames}
            pessoasById={pessoasById}
            isReply
            viewerPessoaId={viewerPessoaId}
            viewerIsAdmin={viewerIsAdmin}
          />
        </div>
      ))}
      {isReplyTo && (
        <div className="flex flex-col gap-1.5" style={{ marginLeft: 24, marginTop: 8 }}>
          <textarea
            className="inp resize-y min-h-[50px] text-sm"
            value={newReply}
            onChange={(e) => setNewReply(e.target.value)}
            placeholder="responder…"
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSubmitReply(c.id);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                onCancelReply();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-primary text-xs"
              onClick={() => onSubmitReply(c.id)}
              disabled={!newReply.trim()}
            >
              responder
            </button>
            <button className="btn btn-ghost text-xs" onClick={onCancelReply}>
              cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentBubble({
  c,
  editingId,
  editingDraft,
  setEditingDraft,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onToggleVisivel,
  onStartReply,
  internalFirstNames,
  isReply,
  viewerPessoaId,
  viewerIsAdmin,
}: {
  c: Comment;
  editingId: string;
  editingDraft: string;
  setEditingDraft: (s: string) => void;
  onStartEdit: (c: Comment) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (c: Comment) => void;
  onToggleVisivel: (c: Comment) => void;
  onStartReply: (id: string) => void;
  pessoasById: Map<string, { nome: string }>;
  internalFirstNames: Set<string>;
  isReply: boolean;
  viewerPessoaId: string | null;
  viewerIsAdmin: boolean;
}) {
  const isEditing = editingId === c.id;
  const isExternal = !!c.external_source;
  const isAuthor = !!viewerPessoaId && c.author_pessoa_id === viewerPessoaId;
  // canEdit: só o próprio autor (admin não edita texto alheio).
  const canEdit = !isExternal && !c.from_cliente && isAuthor;
  // canDelete: autor ou admin. SF/cliente fica imutável.
  const canDelete = !isExternal && (viewerIsAdmin || isAuthor);
  // canToggleVisivel: igual canDelete mas não pra comments vindos do cliente.
  const canToggleVisivel = !isExternal && !c.from_cliente && (viewerIsAdmin || isAuthor);
  return (
    <div className={`cmsg ${c.from_cliente ? 'from-cliente' : ''}`}>
      <div className="cmsg-head">
        <span className={`cmsg-avatar ${c.from_cliente ? 'cliente' : ''}`}>
          {(c.author || '—').charAt(0).toUpperCase()}
        </span>
        <span className="cmsg-who">{c.author || '—'}</span>
        {c.external_source === 'salesforce' && (
          <span
            className="cmsg-badge"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand-dark)' }}
          >
            SF
          </span>
        )}
        {c.from_cliente && <span className="cmsg-badge">cliente</span>}
        <span className="cmsg-when">{fmtPostedEm(c.posted_em || c.criado_em)}</span>
        {c.edited_em && (
          <span className="text-[10px] text-muted italic" title="editado">
            (editado)
          </span>
        )}
        {canToggleVisivel && (
          <button
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-mono cursor-pointer transition ${c.visivel_cliente ? 'bg-cyan-soft' : 'bg-surface-2 text-muted hover:text-ink'}`}
            style={c.visivel_cliente ? { color: '#0066AD' } : undefined}
            onClick={() => onToggleVisivel(c)}
            title={
              c.visivel_cliente
                ? 'Clique pra tornar só interno'
                : 'Clique pra publicar no Portal do cliente'
            }
          >
            {c.visivel_cliente ? 'externo' : 'interno'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!isReply && !isEditing && (
            <button
              className="text-[11px] text-muted hover:text-ink"
              onClick={() => onStartReply(c.id)}
            >
              ↳ responder
            </button>
          )}
          {canEdit && !isEditing && (
            <button
              className="text-[11px] text-muted hover:text-ink"
              title="Editar"
              onClick={() => onStartEdit(c)}
            >
              ✎
            </button>
          )}
          {canDelete && !isEditing && (
            <button
              className="text-[11px] text-muted hover:text-danger"
              title="Excluir"
              onClick={() => onDelete(c)}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {!isEditing ? (
        <div
          className="cmsg-body"
          dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body, internalFirstNames) }}
        />
      ) : (
        <div className="flex flex-col gap-1.5 mt-1">
          <textarea
            className="inp resize-y min-h-[60px] text-sm"
            value={editingDraft}
            onChange={(e) => setEditingDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                onSaveEdit(c.id);
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                onCancelEdit();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-primary text-xs"
              onClick={() => onSaveEdit(c.id)}
              disabled={!editingDraft.trim()}
            >
              salvar
            </button>
            <button className="btn btn-ghost text-xs" onClick={onCancelEdit}>
              cancelar
            </button>
          </div>
        </div>
      )}
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
