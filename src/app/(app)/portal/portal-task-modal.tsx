'use client';

/**
 * Modal de detalhe da task no Portal cliente. Aberto quando o cliente
 * clica num card. Layout simplificado vs task-modal interno:
 * - Status humanizado (em andamento / em pausa / ⚠ aguardando você / ✓ concluída)
 * - Descrição
 * - Projeto + contato (primeiro nome do responsável)
 * - "Já respondi" — quando bloqueado por cliente, formulário com textarea + botão
 * - Linha do tempo (criação + transição de status)
 * - Conversa pública (visível ao cliente, threaded com replies)
 *
 * Portado de index.html linhas 1892-1986 + lib/views/portal.js (handlers).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { fmtDate, fmtPostedEm } from '@/lib/format';
import { STATUS } from '@/lib/task-constants';
import type { Task } from '@/lib/types';

interface PortalComment {
  id: string;
  parent_id: string | null;
  author: string | null;
  author_pessoa_id: string | null;
  body: string;
  posted_em: string | null;
  criado_em: string;
  external_source: string | null;
  visivel_cliente: boolean;
  from_cliente: boolean | null;
}

interface PortalTaskModalProps {
  task: Task | null;
  clienteNome: string;
  onClose: () => void;
}

function timelineFor(t: Task): { ts: number; label: string }[] {
  const items: { ts: number; label: string }[] = [];
  if (t.criadoEm) items.push({ ts: t.criadoEm, label: 'Tarefa criada' });
  if (t.statusEm && t.statusEm !== t.criadoEm) {
    const macro =
      t.status === 'andamento'
        ? 'Em andamento'
        : t.status === 'bloqueado'
          ? 'Em pausa'
          : t.status === STATUS.CONCLUIDO
            ? 'Concluída'
            : 'No backlog';
    items.push({ ts: t.statusEm, label: macro });
  }
  return items.sort((a, b) => a.ts - b.ts);
}

export function PortalTaskModal({ task, clienteNome, onClose }: PortalTaskModalProps) {
  const { projetos, pessoas } = useData();
  const toast = useToastSafe();

  const [comments, setComments] = useState<PortalComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const sb = useMemo(() => createClient(), []);

  const projetosById = useMemo(() => new Map(projetos.map((p) => [p.id, p])), [projetos]);
  const pessoasById = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);

  // Carrega comments públicos da task
  const loadComments = useCallback(
    async (taskId: string) => {
      if (!taskId) {
        setComments([]);
        return;
      }
      const { data, error } = await sb
        .from('task_comments')
        .select(
          'id, parent_id, author, author_pessoa_id, body, posted_em, criado_em, external_source, visivel_cliente, from_cliente',
        )
        .eq('task_id', taskId)
        .eq('visivel_cliente', true)
        .order('posted_em', { ascending: true, nullsFirst: true })
        .order('criado_em', { ascending: true });
      if (!error) setComments((data || []) as PortalComment[]);
    },
    [sb],
  );

  useEffect(() => {
    if (!task) {
      setComments([]);
      setNewComment('');
      setReplyText('');
      return;
    }
    void loadComments(task.id);
  }, [task, loadComments]);

  // ESC fecha
  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [task, onClose]);

  // Notif fire-and-forget pro responsável da task. Disparado pelos
  // 2 fluxos abaixo (Comentar = cliente_comentou; Já respondi =
  // cliente_respondeu). Sem await — não bloqueia o sucesso do post.
  const fireClienteNotif = useCallback(
    (kind: 'cliente_comentou' | 'cliente_respondeu', commentId: string, preview: string) => {
      if (!task?.pessoaId) return;
      sb.from('notifications')
        .insert({
          recipient_pessoa_id: task.pessoaId,
          kind,
          payload: {
            author: clienteNome || 'cliente',
            task_id: task.id,
            comment_id: commentId,
            preview: preview.slice(0, 80),
          },
          source_task_id: task.id,
          source_comment_id: commentId,
        })
        .then(({ error }) => {
          if (error) console.warn('[notif cliente] insert failed', error);
        });
    },
    [task, sb, clienteNome],
  );

  const submitComment = useCallback(async () => {
    const body = newComment.trim();
    if (!body || !task || sending) return;
    setSending(true);
    const { data, error } = await sb
      .from('task_comments')
      .insert({
        task_id: task.id,
        author: clienteNome || 'cliente',
        body,
        author_pessoa_id: null,
        visivel_cliente: true,
        from_cliente: true,
      })
      .select('id')
      .single();
    setSending(false);
    if (error) {
      toast.error('Erro ao comentar: ' + error.message);
      return;
    }
    if (data?.id) fireClienteNotif('cliente_comentou', data.id, body);
    setNewComment('');
    await loadComments(task.id);
    toast.success('Comentário enviado.');
  }, [newComment, task, sending, sb, clienteNome, toast, loadComments, fireClienteNotif]);

  const submitJaRespondi = useCallback(async () => {
    const body = replyText.trim();
    if (!body || !task || sending) return;
    setSending(true);
    const fullBody = '✓ Já respondi: ' + body;
    const { data, error } = await sb
      .from('task_comments')
      .insert({
        task_id: task.id,
        author: clienteNome || 'cliente',
        body: fullBody,
        author_pessoa_id: null,
        visivel_cliente: true,
        from_cliente: true,
      })
      .select('id')
      .single();
    setSending(false);
    if (error) {
      toast.error('Erro: ' + error.message);
      return;
    }
    if (data?.id) fireClienteNotif('cliente_respondeu', data.id, fullBody);
    setReplyText('');
    await loadComments(task.id);
    toast.success('Sua resposta foi enviada ao time. Eles vão verificar.');
  }, [replyText, task, sending, sb, clienteNome, toast, loadComments, fireClienteNotif]);

  if (!task) return null;

  const topLevel = comments.filter((c) => !c.parent_id);
  const repliesOf = (parentId: string) => comments.filter((c) => c.parent_id === parentId);

  const projetoNome = projetosById.get(task.projetoId)?.nome ?? '';
  const contatoNome =
    task.pessoaId && pessoasById.get(task.pessoaId)
      ? (pessoasById.get(task.pessoaId)!.nome || '').split(' ')[0]
      : '';

  const aguardandoCliente =
    task.subetapa === 'bloqueado' && task.bloqueadoPor === 'cliente';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 px-2 py-2 md:items-center md:px-4 md:py-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[680px] flex-col overflow-hidden rounded-lg border border-line bg-bg-elev shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 md:px-6">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
              tarefa
            </div>
            <div className="mt-0.5 font-brand text-lg font-semibold md:text-xl">
              {task.titulo}
            </div>
          </div>
          <button
            className="px-2 text-2xl text-muted hover:text-ink"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {task.status === 'andamento' && (
              <span
                className="rounded px-2 py-1 font-mono text-xs"
                style={{
                  background: 'var(--brand-tint)',
                  color: 'var(--brand-dark)',
                  border: '1px solid var(--brand)',
                }}
              >
                em andamento
              </span>
            )}
            {task.status === STATUS.CONCLUIDO && (
              <span
                className="rounded px-2 py-1 font-mono text-xs"
                style={{
                  background: 'var(--bg-elev)',
                  color: 'var(--p3)',
                  border: '1px solid var(--line)',
                }}
              >
                ✓ concluída
              </span>
            )}
            {aguardandoCliente && (
              <span
                className="rounded px-2 py-1 font-mono text-xs"
                style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                }}
              >
                ⚠ aguardando você
              </span>
            )}
            {task.status === 'bloqueado' && !aguardandoCliente && (
              <span
                className="rounded px-2 py-1 font-mono text-xs"
                style={{
                  background: 'var(--bg-elev)',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                }}
              >
                em pausa
              </span>
            )}
            {task.status === 'backlog' && (
              <span
                className="rounded px-2 py-1 font-mono text-xs"
                style={{
                  background: 'var(--bg-elev)',
                  color: 'var(--muted)',
                  border: '1px solid var(--line)',
                }}
              >
                a iniciar
              </span>
            )}
            {task.prazo && (
              <span className="font-mono text-xs text-ink-soft">
                prazo: {fmtDate(task.prazo)}
              </span>
            )}
          </div>

          {task.descricao && (
            <div className="mb-4 whitespace-pre-wrap text-sm text-ink-soft">
              {task.descricao}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Projeto
              </div>
              <div className="mt-0.5 text-ink">{projetoNome}</div>
            </div>
            {contatoNome && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Seu contato
                </div>
                <div className="mt-0.5 text-ink">{contatoNome}</div>
              </div>
            )}
          </div>

          {aguardandoCliente && (
            <div
              className="card mb-4 p-4"
              style={{ background: '#fffbeb', borderColor: '#fde68a' }}
            >
              <div
                className="mb-1 font-brand text-sm font-semibold"
                style={{ color: '#b45309' }}
              >
                Já respondeu?
              </div>
              <div className="mb-3 text-xs text-ink-soft">
                Conta pro time o que você decidiu/respondeu. Eles vão revisar e seguir.
              </div>
              <textarea
                className="inp min-h-[80px] resize-y text-sm"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="ex.: Aprovei o desconto de 10% nos planos família."
              />
              <button
                className="btn btn-primary mt-2 text-sm"
                onClick={submitJaRespondi}
                disabled={!replyText.trim() || sending}
              >
                enviar resposta ao time
              </button>
            </div>
          )}

          <div className="mb-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
              Linha do tempo
            </div>
            <div className="space-y-1.5 text-sm">
              {timelineFor(task).map((ev) => (
                <div key={ev.ts} className="flex items-center gap-2 text-ink-soft">
                  <span className="w-20 font-mono text-[10px] text-muted">
                    {new Date(ev.ts).toLocaleDateString('pt-BR')}
                  </span>
                  <span>{ev.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted">
              Conversa
            </div>
            <div className="mb-4 space-y-3">
              {topLevel.map((c) => (
                <div key={c.id}>
                  <div
                    className="border-l-2 py-1 pl-3"
                    style={{
                      borderColor: c.from_cliente ? '#b45309' : 'var(--brand)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-ink">{c.author || '—'}</span>
                      <span className="font-mono text-muted">
                        {fmtPostedEm(c.posted_em || c.criado_em)}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">
                      {c.body}
                    </div>
                  </div>
                  {repliesOf(c.id).map((r) => (
                    <div
                      key={r.id}
                      className="ml-5 mt-2 border-l-2 py-1 pl-3"
                      style={{
                        borderColor: r.from_cliente ? '#b45309' : 'var(--brand)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink">{r.author || '—'}</span>
                        <span className="font-mono text-muted">
                          {fmtPostedEm(r.posted_em || r.criado_em)}
                        </span>
                      </div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">
                        {r.body}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              {comments.length === 0 && (
                <div className="text-xs italic text-muted">Nenhum comentário ainda.</div>
              )}
            </div>
            <textarea
              className="inp min-h-[60px] resize-y text-sm"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="comentar nesta tarefa…"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submitComment();
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted">
                ⌘ + enter envia · seu comentário fica visível ao time
              </span>
              <button
                className="btn btn-primary text-sm"
                onClick={submitComment}
                disabled={!newComment.trim() || sending}
              >
                enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
