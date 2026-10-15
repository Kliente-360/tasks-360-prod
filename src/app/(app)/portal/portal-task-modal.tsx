'use client';

/**
 * Modal da task no Portal do cliente (out/2026 · mockup aprovado).
 *
 * Estrutura: cabeçalho (status, prioridade, prazo, responsável, pedir
 * prioridade) → progresso das etapas → faixa de ação quando o cliente tem
 * algo a fazer → corpo em 2 colunas: solicitação/entrega/dados à esquerda,
 * conversa à direita.
 *
 * Ações do cliente vão por RPC security definer (RLS de cliente em tasks é
 * só SELECT): app_aprovar_entrega, app_pedir_ajuste, app_responder_pendencia,
 * app_pedir_prioridade. Cada RPC grava comentário + histórico + aviso ao time.
 * Admin/interno simulando o portal veem as ações desabilitadas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { Icon } from '@/components/icons';
import { fmtDate, fmtPostedEm } from '@/lib/format';
import { STATUS, SUB_LABELS, SUB_TO_MACRO } from '@/lib/task-constants';
import type { Task } from '@/lib/types';

interface PortalComment {
  id: string;
  author: string | null;
  body: string;
  posted_em: string | null;
  criado_em: string;
  from_cliente: boolean | null;
  kind: string | null;
}

interface SubetapaEvento {
  to_value: string | null;
  occurred_at: string;
}

interface Detalhes {
  descricao: string;
  valorEsperado: string;
  solucao: string;
}

interface PortalTaskModalProps {
  task: Task | null;
  clienteNome: string;
  onClose: () => void;
}

const PRIO_CLIENTE_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

const SIMULANDO = 'Só o cliente faz esta ação · você está simulando o portal';

function diaMes(ms: number | null | undefined): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ── Progresso ────────────────────────────────────────────────────────

const ETAPAS = ['Solicitada', 'Desenvolvimento', 'Homologação', 'Concluída'] as const;

function etapaAtual(t: Task): { idx: number; label?: string; pausada: boolean } {
  if (t.status === STATUS.CONCLUIDO) return { idx: 4, pausada: false };
  switch (t.subetapa) {
    case 'em_desenvolvimento':
    case 'em_revisao':
      return { idx: 1, pausada: false };
    case 'em_homologacao':
      return { idx: 2, pausada: false };
    case 'pronto_producao':
    case 'em_implantacao':
      return { idx: 3, label: 'Indo para produção', pausada: false };
    case 'bloqueado':
      return { idx: t.homologacaoEm ? 2 : t.andamentoEm ? 1 : 0, pausada: true };
    default:
      return { idx: 0, pausada: false };
  }
}

function Progresso({ task }: { task: Task }) {
  const cur = etapaAtual(task);
  const datas = [
    task.criadoEm,
    task.andamentoEm || null,
    task.homologacaoEm,
    task.status === STATUS.CONCLUIDO ? task.statusEm : null,
  ];
  return (
    <ol className="pmodal-steps" aria-label="Progresso da tarefa">
      {ETAPAS.map((nome, i) => {
        const feita = i < cur.idx;
        const atual = i === cur.idx;
        const estado = feita ? 'done' : atual ? (cur.pausada ? 'paused' : 'current') : 'todo';
        return (
          <li key={nome} className={`pmodal-step is-${estado}`} aria-current={atual ? 'step' : undefined}>
            <div className="pmodal-step-track">
              <span className="pmodal-step-dot">
                {feita && <Icon name="check" size={12} />}
                {estado === 'paused' && <Icon name="pause" size={10} />}
              </span>
              {i < ETAPAS.length - 1 && <span className="pmodal-step-line" />}
            </div>
            <div className="pmodal-step-name">
              {atual ? `${cur.label ?? nome}${cur.pausada ? ' · pausada' : ' · agora'}` : nome}
            </div>
            <div className="pmodal-step-date">
              {feita ? diaMes(datas[i]) || '—' : atual ? `desde ${diaMes(task.subetapaEm) || '—'}` : '—'}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Conversa ─────────────────────────────────────────────────────────

const KIND_TAG: Record<string, string> = {
  pendencia: 'Pergunta do time',
  resposta_pendencia: 'Resposta à pendência',
  pedido_prioridade: 'Pedido de prioridade',
  resposta_prioridade: 'Resposta ao pedido de prioridade',
  ajuste_solicitado: 'Pedido de ajuste',
};

type ItemConversa =
  | { tipo: 'comment'; ts: number; c: PortalComment }
  | { tipo: 'etapa'; ts: number; sub: string };

function Conversa({ comments, eventos }: { comments: PortalComment[]; eventos: SubetapaEvento[] }) {
  const itens = useMemo<ItemConversa[]>(() => {
    const out: ItemConversa[] = [];
    for (const c of comments) {
      out.push({ tipo: 'comment', ts: new Date(c.posted_em || c.criado_em).getTime(), c });
    }
    for (const e of eventos) {
      if (e.to_value) out.push({ tipo: 'etapa', ts: new Date(e.occurred_at).getTime(), sub: e.to_value });
    }
    return out.sort((a, b) => a.ts - b.ts);
  }, [comments, eventos]);

  if (itens.length === 0) {
    return <div className="pmodal-empty">Nenhuma mensagem ainda. Escreva abaixo se quiser falar com o time.</div>;
  }
  return (
    <div className="pmodal-convo">
      {itens.map((it) => {
        if (it.tipo === 'etapa') {
          return (
            <div key={`e-${it.ts}-${it.sub}`} className="pmodal-sep">
              <span />
              {SUB_LABELS[it.sub] ?? it.sub} · {diaMes(it.ts)}
              <span />
            </div>
          );
        }
        const c = it.c;
        if (c.kind === 'aprovacao') {
          return (
            <div key={c.id} className="pmodal-sep is-ok">
              <span />
              <Icon name="check" size={12} /> Entrega aprovada por {c.author ?? 'cliente'} · {diaMes(it.ts)}
              <span />
            </div>
          );
        }
        const doCliente = !!c.from_cliente;
        const tag = c.kind ? KIND_TAG[c.kind] : null;
        return (
          <div
            key={c.id}
            className={`pmodal-msg ${doCliente ? 'is-cliente' : 'is-time'} ${c.kind ? `kind-${c.kind}` : ''}`}
          >
            <div className="pmodal-msg-meta">
              <b>{c.author || (doCliente ? 'Cliente' : 'Time')}</b> · {fmtPostedEm(c.posted_em || c.criado_em)}
            </div>
            <div className="pmodal-msg-body">
              {tag && <div className="pmodal-msg-tag">{tag}</div>}
              {c.body}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Diálogo de pedido de prioridade ──────────────────────────────────

function PedirPrioridadeDialog({
  prioridadeAtual,
  enviando,
  onCancel,
  onEnviar,
}: {
  prioridadeAtual: string | null;
  enviando: boolean;
  onCancel: () => void;
  onEnviar: (prio: 'alta' | 'urgente', motivo: string, ate: string | null) => void;
}) {
  const [prio, setPrio] = useState<'alta' | 'urgente'>('alta');
  const [motivo, setMotivo] = useState('');
  const [ate, setAte] = useState('');
  return (
    <div className="pmodal-dialog-wrap" onClick={onCancel}>
      <div
        className="pmodal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pmodal-dialog-head">
          <h2 id="pp-title">Pedir mais prioridade</h2>
          <p>
            Hoje esta tarefa está com prioridade{' '}
            <b>{prioridadeAtual ? (PRIO_CLIENTE_LABEL[prioridadeAtual] ?? prioridadeAtual).toLowerCase() : 'não informada'}</b>.
            O time avalia seu pedido e responde na conversa da tarefa.
          </p>
        </div>
        <div className="pmodal-dialog-body">
          <fieldset className="pmodal-fieldset">
            <legend>Qual prioridade você precisa?</legend>
            {(
              [
                { v: 'alta', t: 'Alta', d: 'Precisa entrar na fila das próximas entregas.' },
                { v: 'urgente', t: 'Urgente', d: 'Está parando a operação hoje.' },
              ] as const
            ).map((o) => (
              <label key={o.v} className={`pmodal-opt ${prio === o.v ? 'is-on' : ''}`}>
                <input type="radio" name="pp-prio" checked={prio === o.v} onChange={() => setPrio(o.v)} />
                <span>
                  <b>{o.t}</b>
                  <span>{o.d}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="pmodal-field">
            <label htmlFor="pp-motivo">
              O que mudou? <span>obrigatório</span>
            </label>
            <textarea
              id="pp-motivo"
              className="inp"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: a campanha começa dia 1º e depende desta entrega."
            />
          </div>
          <div className="pmodal-field">
            <label htmlFor="pp-ate">
              Precisa até quando? <span>opcional</span>
            </label>
            <input
              id="pp-ate"
              type="date"
              className="inp"
              style={{ width: 180 }}
              value={ate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </div>
        <div className="pmodal-dialog-foot">
          <span>A prioridade só muda depois que o time confirmar.</span>
          <button type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!motivo.trim() || enviando}
            onClick={() => onEnviar(prio, motivo.trim(), ate || null)}
          >
            {enviando ? 'Enviando…' : 'Enviar pedido'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────

export function PortalTaskModal({ task, clienteNome, onClose }: PortalTaskModalProps) {
  const { projetos, pessoas, clientes, patchTask, viewerRole } = useData();
  const toast = useToastSafe();
  const sb = useMemo(() => createClient(), []);

  const [comments, setComments] = useState<PortalComment[]>([]);
  const [eventos, setEventos] = useState<SubetapaEvento[]>([]);
  const [detalhes, setDetalhes] = useState<Detalhes | null>(null);
  const [newComment, setNewComment] = useState('');
  const [resposta, setResposta] = useState('');
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajuste, setAjuste] = useState('');
  const [prioAberto, setPrioAberto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const taskId = task?.id ?? '';
  const ehCliente = viewerRole === 'cliente';

  const carregar = useCallback(
    async (id: string) => {
      const [c, h, d] = await Promise.all([
        sb
          .from('task_comments')
          .select('id, author, body, posted_em, criado_em, from_cliente, kind')
          .eq('task_id', id)
          .eq('visivel_cliente', true)
          .order('posted_em', { ascending: true, nullsFirst: true })
          .order('criado_em', { ascending: true }),
        sb
          .from('task_field_history')
          .select('to_value, occurred_at')
          .eq('task_id', id)
          .eq('field', 'subetapa')
          .order('occurred_at', { ascending: true }),
        sb.from('tasks').select('descricao, valor_esperado, solucao_implementada').eq('id', id).single(),
      ]);
      if (!c.error) setComments((c.data ?? []) as PortalComment[]);
      if (!h.error) setEventos((h.data ?? []) as SubetapaEvento[]);
      if (!d.error && d.data) {
        const r = d.data as Record<string, string | null>;
        setDetalhes({
          descricao: r.descricao ?? '',
          valorEsperado: r.valor_esperado ?? '',
          solucao: r.solucao_implementada ?? '',
        });
      }
    },
    [sb],
  );

  useEffect(() => {
    setComments([]);
    setEventos([]);
    setDetalhes(null);
    setNewComment('');
    setResposta('');
    setAjuste('');
    setAjusteAberto(false);
    setPrioAberto(false);
    if (taskId) void carregar(taskId);
  }, [taskId, carregar]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (prioAberto) setPrioAberto(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskId, prioAberto, onClose]);

  // Executa uma RPC de ação do cliente com feedback e recarga
  const acao = useCallback(
    async (
      nome: string,
      run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
      sucesso: string,
      aplicar: (data: unknown) => void,
    ) => {
      if (!task || busy) return false;
      setBusy(nome);
      const { data, error } = await run();
      setBusy(null);
      if (error) {
        toast.error(error.message);
        return false;
      }
      aplicar(data);
      toast.success(sucesso);
      void carregar(task.id);
      return true;
    },
    [task, busy, toast, carregar],
  );

  const enviarComentario = useCallback(async () => {
    const body = newComment.trim();
    if (!body || !task || busy) return;
    setBusy('comentar');
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
    setBusy(null);
    if (error) {
      toast.error('Erro ao enviar: ' + error.message);
      return;
    }
    if (task.pessoaId && data?.id) {
      void sb.from('notifications').insert({
        recipient_pessoa_id: task.pessoaId,
        kind: 'cliente_comentou',
        payload: { author: clienteNome || 'cliente', task_id: task.id, comment_id: data.id, preview: body.slice(0, 80) },
        source_task_id: task.id,
        source_comment_id: data.id,
      });
    }
    setNewComment('');
    void carregar(task.id);
  }, [newComment, task, busy, sb, clienteNome, toast, carregar]);

  if (!task) return null;

  const agora = Date.now();
  const projeto = projetos.find((p) => p.id === task.projetoId)?.nome ?? '';
  const cliente = clientes.find((c) => c.id === task.clienteId)?.nome ?? clienteNome;
  const responsavel = (pessoas.find((p) => p.id === task.pessoaId)?.nome ?? '').split(' ')[0];
  const concluida = task.status === STATUS.CONCLUIDO;
  const aguardandoResposta = task.subetapa === 'bloqueado' && task.bloqueadoPor === 'cliente';
  const homologar = task.subetapa === 'em_homologacao' && task.aprovadoEm == null;
  const pedidoPendente = !!task.prioridadePedidoEm;
  const pendencia = [...comments].reverse().find((c) => c.kind === 'pendencia') ?? null;
  const atrasada = !!(task.prazo && !concluida && task.prazo < new Date().toISOString().slice(0, 10));

  const statusChip = concluida
    ? { cls: 'is-ok', txt: 'Concluída' }
    : aguardandoResposta
      ? { cls: 'is-danger', txt: 'Pausada · aguardando você' }
      : task.subetapa === 'bloqueado'
        ? { cls: 'is-muted', txt: 'Pausada' }
        : homologar
          ? { cls: 'is-warn', txt: SUB_LABELS[task.subetapa] }
          : { cls: 'is-brand', txt: SUB_LABELS[task.subetapa] ?? task.subetapa };

  const aprovar = () =>
    acao(
      'aprovar',
      () => sb.rpc('app_aprovar_entrega', { p_task_id: task.id }),
      'Entrega aprovada. O time foi avisado.',
      () =>
        patchTask(task.id, {
          aprovadoEm: task.aprovadoEm ?? agora,
          ...(task.subetapa === 'em_homologacao'
            ? { subetapa: 'pronto_producao', status: 'andamento', subetapaEm: agora }
            : {}),
        }),
    );

  const pedirAjuste = async () => {
    const ok = await acao(
      'ajuste',
      () => sb.rpc('app_pedir_ajuste', { p_task_id: task.id, p_body: ajuste.trim() }),
      'Pedido de ajuste enviado ao time.',
      () => patchTask(task.id, { subetapa: 'em_revisao', status: 'andamento', subetapaEm: agora }),
    );
    if (ok) {
      setAjuste('');
      setAjusteAberto(false);
    }
  };

  const responder = async () => {
    const ok = await acao(
      'responder',
      () => sb.rpc('app_responder_pendencia', { p_task_id: task.id, p_body: resposta.trim() }),
      'Resposta enviada. O time foi avisado.',
      (data) => {
        const sub = typeof data === 'string' ? data : 'bloqueado';
        if (sub !== 'bloqueado') {
          patchTask(task.id, {
            subetapa: sub,
            status: (SUB_TO_MACRO[sub] ?? 'andamento') as Task['status'],
            subetapaEm: agora,
            bloqueadoPor: '',
          });
        }
      },
    );
    if (ok) setResposta('');
  };

  const pedirPrioridade = async (prio: 'alta' | 'urgente', motivo: string, ate: string | null) => {
    const ok = await acao(
      'prioridade',
      () =>
        sb.rpc('app_pedir_prioridade', {
          p_task_id: task.id,
          p_prioridade: prio,
          p_motivo: motivo,
          p_ate: ate,
        }),
      'Pedido enviado. O time responde aqui na conversa.',
      () =>
        patchTask(task.id, {
          prioridadeSolicitadaCliente: prio,
          prioridadePedidoEm: agora,
          prioridadePedidoAte: ate,
        }),
    );
    if (ok) setPrioAberto(false);
  };

  const prioBloqueadaMotivo = !ehCliente
    ? SIMULANDO
    : concluida
      ? 'Tarefa concluída'
      : pedidoPendente
        ? 'Já existe um pedido aguardando o time'
        : undefined;

  return createPortal(
    <div className="pmodal-backdrop" onClick={onClose}>
      <div
        className="pmodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmodal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="pmodal-head">
          <div className="pmodal-head-main">
            <div className="pmodal-eyebrow">
              {cliente}
              {projeto && ` · ${projeto}`}
            </div>
            <h1 id="pmodal-title" className="pmodal-title">
              {task.titulo}
            </h1>
            <div className="pmodal-chips">
              <span className={`pmodal-chip ${statusChip.cls}`}>
                <span className="pmodal-dot" />
                {statusChip.txt}
              </span>
              {task.prioridade && (
                <span className={`pri pri-${task.prioridade}`}>
                  <span className="pri-dot" />
                  {task.prioridade}
                </span>
              )}
              {task.prazo && (
                <span className={`pmodal-chip font-mono ${atrasada ? 'is-danger' : ''}`}>
                  Prazo {fmtDate(task.prazo)}
                </span>
              )}
              {responsavel && (
                <span className="pmodal-chip">
                  <span className="pmodal-avatar">{responsavel.charAt(0)}</span>
                  {responsavel}
                </span>
              )}
            </div>
          </div>
          <div className="pmodal-head-actions">
            <button
              type="button"
              className="btn pmodal-btn-quiet"
              onClick={() => setPrioAberto(true)}
              disabled={!!prioBloqueadaMotivo}
              title={prioBloqueadaMotivo}
            >
              <Icon name="arrow-up" size={15} />
              Pedir prioridade
            </button>
            <button type="button" className="pmodal-close" onClick={onClose} aria-label="Fechar">
              <Icon name="x" size={20} />
            </button>
          </div>
        </header>

        <div className="pmodal-scroll">
          <Progresso task={task} />

          {/* Faixa de ação */}
          {aguardandoResposta ? (
            <section className="pmodal-band is-danger">
              <div className="pmodal-band-title">O time precisa de uma resposta sua para seguir</div>
              <div className="pmodal-band-quote">
                {pendencia ? (
                  <>
                    <span className="pmodal-band-quote-meta">
                      <b>{pendencia.author ?? 'Time'}</b> · {fmtPostedEm(pendencia.posted_em || pendencia.criado_em)}
                    </span>
                    {pendencia.body}
                  </>
                ) : (
                  'O time está aguardando um retorno seu. Veja a conversa ao lado.'
                )}
              </div>
              <div className="pmodal-band-form">
                <label htmlFor="pmodal-resposta">Sua resposta</label>
                <div className="pmodal-band-row">
                  <textarea
                    id="pmodal-resposta"
                    className="inp"
                    rows={2}
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Responda aqui. O time é avisado e a tarefa volta a andar."
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!ehCliente || !resposta.trim() || !!busy}
                    title={ehCliente ? undefined : SIMULANDO}
                    onClick={responder}
                  >
                    {busy === 'responder' ? 'Enviando…' : 'Responder'}
                  </button>
                </div>
              </div>
            </section>
          ) : homologar ? (
            <section className="pmodal-band is-warn">
              <div className="pmodal-band-line">
                <div className="pmodal-band-text">
                  <div className="pmodal-band-title">Sua vez: homologar a entrega</div>
                  <div className="pmodal-band-sub">
                    Confira o que foi entregue. Ao aprovar, a tarefa segue para produção.
                  </div>
                </div>
                {!ajusteAberto && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={!ehCliente || !!busy}
                      title={ehCliente ? undefined : SIMULANDO}
                      onClick={() => setAjusteAberto(true)}
                    >
                      Pedir ajuste
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!ehCliente || !!busy}
                      title={ehCliente ? undefined : SIMULANDO}
                      onClick={aprovar}
                    >
                      <Icon name="check" size={15} />
                      {busy === 'aprovar' ? 'Aprovando…' : 'Aprovar entrega'}
                    </button>
                  </>
                )}
              </div>
              {ajusteAberto && (
                <div className="pmodal-band-form">
                  <label htmlFor="pmodal-ajuste">O que precisa ser ajustado?</label>
                  <textarea
                    id="pmodal-ajuste"
                    className="inp"
                    rows={3}
                    value={ajuste}
                    onChange={(e) => setAjuste(e.target.value)}
                    placeholder="Descreva o que não ficou como esperado."
                    autoFocus
                  />
                  <div className="pmodal-band-actions">
                    <button type="button" className="btn" onClick={() => setAjusteAberto(false)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!ajuste.trim() || !!busy}
                      onClick={pedirAjuste}
                    >
                      {busy === 'ajuste' ? 'Enviando…' : 'Enviar pedido de ajuste'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : pedidoPendente ? (
            <section className="pmodal-band is-info">
              <div className="pmodal-band-title">
                Pedido de prioridade {PRIO_CLIENTE_LABEL[task.prioridadeSolicitadaCliente ?? 'alta']?.toLowerCase()} enviado
                em {diaMes(task.prioridadePedidoEm)}
              </div>
              <div className="pmodal-band-sub">O time responde aqui na conversa.</div>
            </section>
          ) : task.aprovadoEm && !concluida ? (
            <section className="pmodal-band is-ok">
              <div className="pmodal-band-title">Você aprovou esta entrega em {diaMes(task.aprovadoEm)}</div>
              <div className="pmodal-band-sub">A tarefa segue para produção.</div>
            </section>
          ) : null}

          {/* Corpo */}
          <div className="pmodal-body">
            <div className="pmodal-col-main">
              <section className="pmodal-section">
                <div className="pmodal-lbl">Sua solicitação</div>
                {detalhes === null ? (
                  <div className="pmodal-loading">Carregando…</div>
                ) : detalhes.descricao ? (
                  <div className="pmodal-text">{detalhes.descricao}</div>
                ) : (
                  <div className="pmodal-empty">Sem descrição.</div>
                )}
                {detalhes?.valorEsperado && (
                  <div className="pmodal-valor">
                    <div className="pmodal-lbl">Valor esperado</div>
                    <div className="pmodal-text">{detalhes.valorEsperado}</div>
                  </div>
                )}
              </section>

              {detalhes?.solucao && (
                <section className="pmodal-section">
                  <div className="pmodal-lbl">O que foi entregue</div>
                  <div className="pmodal-text">{detalhes.solucao}</div>
                </section>
              )}

              <section className="pmodal-facts">
                <div>
                  <div className="pmodal-lbl">Projeto</div>
                  <div>{projeto || '—'}</div>
                </div>
                <div>
                  <div className="pmodal-lbl">Responsável</div>
                  <div>{responsavel || '—'}</div>
                </div>
                <div>
                  <div className="pmodal-lbl">Aberta em</div>
                  <div className="font-mono text-[13px]">
                    {task.criadoEm ? new Date(task.criadoEm).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>
                <div>
                  <div className="pmodal-lbl">Sua prioridade</div>
                  <div>
                    {task.prioridadeSolicitadaCliente
                      ? PRIO_CLIENTE_LABEL[task.prioridadeSolicitadaCliente]
                      : '—'}
                  </div>
                </div>
              </section>
            </div>

            <div className="pmodal-col-convo">
              <div className="pmodal-lbl pmodal-convo-head">Conversa</div>
              <Conversa comments={comments} eventos={eventos} />
              <div className="pmodal-composer">
                <label htmlFor="pmodal-msg" className="pmodal-lbl">
                  Falar com o time
                </label>
                <div className="pmodal-band-row">
                  <textarea
                    id="pmodal-msg"
                    className="inp"
                    rows={2}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Escreva uma dúvida ou comentário"
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void enviarComentario();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!newComment.trim() || !!busy}
                    onClick={enviarComentario}
                  >
                    {busy === 'comentar' ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {prioAberto && (
          <PedirPrioridadeDialog
            prioridadeAtual={task.prioridadeSolicitadaCliente ?? null}
            enviando={busy === 'prioridade'}
            onCancel={() => setPrioAberto(false)}
            onEnviar={pedirPrioridade}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
