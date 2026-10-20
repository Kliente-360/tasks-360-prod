'use client';
import { track } from '@/lib/telemetry';

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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { Icon } from '@/components/icons';
import { fmtDataCurta, fmtPostedEm } from '@/lib/format';
import { STATUS, SUB_LABELS } from '@/lib/task-constants';
import type { Task } from '@/lib/types';
import { ANEXO_COLS, atalhoColar, enviarImagem, imagensDoClipboard, urlsDosAnexos, type Anexo } from '@/lib/anexos';
import {
  BotaoAnexarImagem,
  ImagensPendentes,
  juntarPendentes,
  MiniaturasAnexos,
  VisualizadorImagem,
} from '@/components/anexos-ui';

interface PortalComment {
  id: string;
  parent_id: string | null;
  author: string | null;
  body: string;
  posted_em: string | null;
  criado_em: string;
  from_cliente: boolean | null;
  kind: string | null;
}

interface Detalhes {
  descricao: string;
  valorEsperado: string;
  solucao: string;
}

interface PortalTaskModalProps {
  task: Task | null;
  /** Nome do responsável · vem do parent (cliente não lê `pessoas`). */
  nomeResponsavel: string;
  clienteNome: string;
  onClose: () => void;
}

const PRIO_CLIENTE_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

/** Visão do cliente da prioridade interna: P0 urgente, P1 alta, P2 média, P3 baixa. */
const PRIO_INTERNA_CLIENTE: Record<string, 'urgente' | 'alta' | 'media' | 'baixa'> = {
  P0: 'urgente',
  P1: 'alta',
  P2: 'media',
  P3: 'baixa',
};
const NIVEL_CLIENTE: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };

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
              {atual ? cur.label ?? nome : nome}
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

function Conversa({
  comments,
  onReply,
  anexosPorMsg,
  urls,
  onAbrirImagem,
}: {
  comments: PortalComment[];
  onReply: (c: PortalComment) => void;
  anexosPorMsg: Map<string, Anexo[]>;
  urls: Record<string, string>;
  onAbrirImagem: (a: Anexo) => void;
}) {
  const porId = useMemo(() => new Map(comments.map((c) => [c.id, c])), [comments]);
  // Conversa ancorada na mais recente: ao abrir e a cada nova mensagem, rola
  // até o fim (no desktop a conversa tem rolagem própria)
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fimRef.current?.parentElement;
    if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
  }, [comments.length]);
  const ordenados = useMemo(
    () =>
      [...comments].sort(
        (a, b) =>
          new Date(a.posted_em || a.criado_em).getTime() - new Date(b.posted_em || b.criado_em).getTime(),
      ),
    [comments],
  );

  if (ordenados.length === 0) {
    return <div className="pmodal-empty">Nenhuma mensagem ainda. Escreva abaixo se quiser falar com o time.</div>;
  }
  return (
    <div className="pmodal-convo">
      {ordenados.map((c) => {
        const ts = new Date(c.posted_em || c.criado_em).getTime();
        if (c.kind === 'aprovacao') {
          return (
            <div key={c.id} className="pmodal-sep is-ok">
              <span />
              <Icon name="check" size={12} /> Entrega aprovada por {c.author ?? 'cliente'} · {diaMes(ts)}
              <span />
            </div>
          );
        }
        const doCliente = !!c.from_cliente;
        const tag = c.kind ? KIND_TAG[c.kind] : null;
        // Resposta a uma mensagem específica: cita a original (estilo WhatsApp).
        // Se a original não é visível ao cliente, não há citação.
        const original = c.parent_id ? porId.get(c.parent_id) : undefined;
        return (
          <div
            key={c.id}
            className={`pmodal-msg ${doCliente ? 'is-cliente' : 'is-time'} ${c.kind ? `kind-${c.kind}` : ''}`}
          >
            <div className="pmodal-msg-meta">
              <b>{c.author || (doCliente ? 'Cliente' : 'Time')}</b> · {fmtPostedEm(c.posted_em || c.criado_em)}
            </div>
            <div className="pmodal-msg-body">
              {original && (
                <div className="pmodal-msg-quote">
                  <b>{original.author || (original.from_cliente ? 'Cliente' : 'Time')}</b>
                  <span>{original.body}</span>
                </div>
              )}
              {tag && <div className="pmodal-msg-tag">{tag}</div>}
              {c.body}
              <MiniaturasAnexos anexos={anexosPorMsg.get(c.id) ?? []} urls={urls} onAbrir={onAbrirImagem} />
            </div>
            <button type="button" className="pmodal-msg-reply" onClick={() => onReply(c)}>
              Responder
            </button>
          </div>
        );
      })}
      <div ref={fimRef} aria-hidden="true" />
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
  prioridadeAtual: 'urgente' | 'alta' | 'media' | 'baixa' | null;
  enviando: boolean;
  onCancel: () => void;
  onEnviar: (prio: 'alta' | 'urgente', motivo: string, ate: string | null) => void;
}) {
  const opcoes = (
    [
      { v: 'alta', t: 'Alta', d: 'Precisa entrar na fila das próximas entregas.' },
      { v: 'urgente', t: 'Urgente', d: 'Está parando a operação hoje.' },
    ] as const
  ).filter((o) => prioridadeAtual == null || NIVEL_CLIENTE[o.v] < NIVEL_CLIENTE[prioridadeAtual]);
  const [prio, setPrio] = useState<'alta' | 'urgente'>(opcoes[0]?.v ?? 'urgente');
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
            {opcoes.map((o) => (
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
              Novo prazo <span>opcional</span>
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

export function PortalTaskModal({ task, nomeResponsavel, clienteNome, onClose }: PortalTaskModalProps) {
  const { projetos, clientes, patchTask, viewerRole, currentPessoa } = useData();
  const toast = useToastSafe();
  const sb = useMemo(() => createClient(), []);

  const [comments, setComments] = useState<PortalComment[]>([]);
  const [detalhes, setDetalhes] = useState<Detalhes | null>(null);
  const [newComment, setNewComment] = useState('');
  // Resposta a uma mensagem específica · banco só permite 1 nível, então
  // responder uma resposta entra na conversa da mensagem original
  const [respondendo, setRespondendo] = useState<PortalComment | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [resposta, setResposta] = useState('');
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajuste, setAjuste] = useState('');
  const [prioAberto, setPrioAberto] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Evidências · imagens da task (soltas e das mensagens) e envio pendente
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [anexoUrls, setAnexoUrls] = useState<Record<string, string>>({});
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [imagemAberta, setImagemAberta] = useState<string | null>(null);
  // Celular: detalhes e conversa em abas (a conversa ficava no fim da rolagem)
  const [abaMobile, setAbaMobile] = useState<'detalhes' | 'conversa'>('conversa');
  const scrollRef = useRef<HTMLDivElement>(null);

  const taskId = task?.id ?? '';
  const ehCliente = viewerRole === 'cliente';

  const carregar = useCallback(
    async (id: string) => {
      const [c, d, a] = await Promise.all([
        sb
          .from('task_comments')
          .select('id, parent_id, author, body, posted_em, criado_em, from_cliente, kind')
          .eq('task_id', id)
          .eq('visivel_cliente', true)
          .order('posted_em', { ascending: true, nullsFirst: true })
          .order('criado_em', { ascending: true }),
        sb.from('tasks').select('descricao, valor_esperado, solucao_implementada').eq('id', id).single(),
        // RLS: cliente só recebe imagens visíveis a ele
        sb.from('task_attachments').select(ANEXO_COLS).eq('task_id', id).order('criado_em', { ascending: true }),
      ]);
      if (!c.error) setComments((c.data ?? []) as PortalComment[]);
      if (!a.error) {
        const lista = (a.data ?? []) as Anexo[];
        setAnexos(lista);
        void urlsDosAnexos(sb, lista).then(setAnexoUrls);
      }
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
    setDetalhes(null);
    setAnexos([]);
    setAnexoUrls({});
    setPendentes([]);
    setNewComment('');
    setRespondendo(null);
    setResposta('');
    setAjuste('');
    setAjusteAberto(false);
    setPrioAberto(false);
    setAbaMobile('conversa');
    if (taskId) void carregar(taskId);
  }, [taskId, carregar]);

  // Na aba Conversa do celular, abre ancorada na mensagem mais recente
  useEffect(() => {
    if (abaMobile !== 'conversa') return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [abaMobile, comments.length]);

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
      track(`portal_${nome}`, { task_id: task.id });
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
    // Só imagem também vale: o texto vira um aviso curto
    const body =
      newComment.trim() ||
      (pendentes.length ? (pendentes.length === 1 ? 'Enviou uma imagem.' : `Enviou ${pendentes.length} imagens.`) : '');
    if (!body || !task || busy) return;
    track('comment_post', { task_id: task.id, props: { portal: true, resposta: !!respondendo } });
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
        parent_id: respondendo ? respondendo.parent_id ?? respondendo.id : null,
      })
      .select('id')
      .single();
    if (error) {
      setBusy(null);
      toast.error('Erro ao enviar: ' + error.message);
      return;
    }
    if (data?.id && pendentes.length) {
      for (const file of pendentes) {
        const r = await enviarImagem(sb, {
          taskId: task.id,
          file,
          autorPessoaId: currentPessoa?.id ?? null,
          commentId: data.id,
          visivelCliente: true,
        });
        if (r.erro) toast.error(r.erro);
      }
      track('anexo_imagem', { task_id: task.id, props: { portal: true, qtd: pendentes.length, origem: 'conversa' } });
    }
    setBusy(null);
    setPendentes([]);
    // Aviso ao time: trigger trg_notif_comentario_cliente no banco
    setNewComment('');
    setRespondendo(null);
    void carregar(task.id);
  }, [newComment, pendentes, respondendo, task, busy, sb, clienteNome, toast, carregar, currentPessoa?.id]);

  if (!task) return null;

  const agora = Date.now();
  const anexosPorMsg = new Map<string, Anexo[]>();
  for (const a of anexos) {
    if (!a.comment_id) continue;
    anexosPorMsg.set(a.comment_id, [...(anexosPorMsg.get(a.comment_id) ?? []), a]);
  }
  const projeto = projetos.find((p) => p.id === task.projetoId)?.nome ?? '';
  const cliente = clientes.find((c) => c.id === task.clienteId)?.nome ?? clienteNome;
  const responsavel = nomeResponsavel.split(' ')[0];
  const prioClienteAtual = task.prioridade ? PRIO_INTERNA_CLIENTE[task.prioridade] ?? null : null;
  const concluida = task.status === STATUS.CONCLUIDO;
  const bloqueadoPorCliente = task.subetapa === 'bloqueado' && task.bloqueadoPor === 'cliente';
  const aguardandoResposta = bloqueadoPorCliente && !task.pendenciaRespondidaEm;
  const respondida = bloqueadoPorCliente && !!task.pendenciaRespondidaEm;
  const homologar = task.subetapa === 'em_homologacao' && task.aprovadoEm == null;
  const pedidoPendente = !!task.prioridadePedidoEm;
  const pendencia = [...comments].reverse().find((c) => c.kind === 'pendencia') ?? null;
  const atrasada = !!(task.prazo && !concluida && task.prazo < new Date().toISOString().slice(0, 10));

  const statusChip = concluida
    ? { cls: 'is-ok', txt: 'Concluída' }
    : aguardandoResposta
      ? { cls: 'is-danger', txt: 'Pausada · aguardando você' }
      : respondida
        ? { cls: 'is-muted', txt: 'Pausada · você respondeu' }
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
      () => patchTask(task.id, { pendenciaRespondidaEm: agora }),
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
          prioridadePedida: prio,
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
      : prioClienteAtual === 'urgente'
        ? 'Esta tarefa já está com prioridade urgente'
      : pedidoPendente
        ? 'Já existe um pedido aguardando o time'
        : undefined;

  const abrirPrioridade = () => {
    track('portal_prioridade_abrir', { task_id: task.id });
    setPrioAberto(true);
  };
  const botaoPrioridade = (
    <button
      type="button"
      className="btn pmodal-btn-quiet"
      onClick={abrirPrioridade}
      disabled={!!prioBloqueadaMotivo}
      title={prioBloqueadaMotivo}
    >
      <Icon name="arrow-up" size={15} />
      Pedir prioridade
    </button>
  );

  return createPortal(
    <div className="pmodal-backdrop" onClick={onClose}>
      <div
        className="pmodal"
        data-aba={abaMobile}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmodal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <header className="pmodal-head">
          <div className="pmodal-head-main">
            <div className="pmodal-eyebrow">{cliente}</div>
            <h1 id="pmodal-title" className="pmodal-title">
              {task.titulo}
            </h1>
            {/* Mesma ordem do card e da tabela: projeto · subetapa ·
                responsável · prioridade · prazo */}
            <div className="pmodal-chips">
              {projeto && <span className="pmodal-chip">{projeto}</span>}
              <span className={`pmodal-chip ${statusChip.cls}`}>
                <span className="pmodal-dot" />
                {statusChip.txt}
              </span>
              {responsavel && (
                <span className="pmodal-chip">
                  <span className="pmodal-avatar">{responsavel.charAt(0)}</span>
                  {responsavel}
                </span>
              )}
              {task.prioridade && (
                <span className={`pri pri-${task.prioridade}`}>
                  <span className="pri-dot" />
                  {task.prioridade}
                </span>
              )}
              {task.prazo && (
                <span className={`pmodal-chip font-mono ${atrasada ? 'is-danger' : ''}`}>
                  {fmtDataCurta(task.prazo)}
                </span>
              )}
              {/* Celular: pedir prioridade fica junto das pills, no topo */}
              <button
                type="button"
                className="pmodal-chip pmodal-chip-acao pmodal-so-mobile"
                onClick={abrirPrioridade}
                disabled={!!prioBloqueadaMotivo}
                title={prioBloqueadaMotivo}
              >
                <Icon name="flag" size={13} />
                Pedir prioridade
              </button>
            </div>
          </div>
          <div className="pmodal-head-actions">
            <span className="pmodal-so-desktop">{botaoPrioridade}</span>
            <button type="button" className="pmodal-close" onClick={onClose} aria-label="Fechar">
              <Icon name="x" size={20} />
            </button>
          </div>
        </header>

        <div className="pmodal-scroll" ref={scrollRef}>
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
                <textarea
                  id="pmodal-resposta"
                  className="inp"
                  rows={3}
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder="Responda aqui. O time é avisado e decide os próximos passos."
                />
                {/* Botão abaixo, à direita (antes ficava ao lado, mais baixo que o campo) */}
                <div className="pmodal-band-actions">
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
          ) : respondida ? (
            <section className="pmodal-band is-info">
              <div className="pmodal-band-title">Você respondeu em {diaMes(task.pendenciaRespondidaEm)}</div>
              <div className="pmodal-band-sub">O time vai avaliar sua resposta e retomar a tarefa.</div>
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
                Pedido de prioridade {PRIO_CLIENTE_LABEL[task.prioridadePedida ?? 'alta']?.toLowerCase()} enviado
                em {diaMes(task.prioridadePedidoEm)}
              </div>
              <div className="pmodal-band-sub">O time responde aqui na conversa.</div>
            </section>
          ) : task.prioridadePedidoResultado && task.prioridadePedidoRespondidoEm && !concluida ? (
            task.prioridadePedidoResultado === 'aceito' ? (
              <section className="pmodal-band is-ok">
                <div className="pmodal-band-title">
                  Pedido de prioridade {PRIO_CLIENTE_LABEL[task.prioridadePedida ?? 'alta']?.toLowerCase()} aceito
                  em {diaMes(task.prioridadePedidoRespondidoEm)}
                </div>
                <div className="pmodal-band-sub">A tarefa já está com a nova prioridade.</div>
              </section>
            ) : (
              <section className="pmodal-band is-info">
                <div className="pmodal-band-title">
                  Pedido de prioridade {PRIO_CLIENTE_LABEL[task.prioridadePedida ?? 'alta']?.toLowerCase()} respondido
                  em {diaMes(task.prioridadePedidoRespondidoEm)}
                </div>
                <div className="pmodal-band-sub">O time manteve a prioridade atual. A explicação está na conversa.</div>
              </section>
            )
          ) : task.aprovadoEm && !concluida ? (
            <section className="pmodal-band is-ok">
              <div className="pmodal-band-title">Você aprovou esta entrega em {diaMes(task.aprovadoEm)}</div>
              <div className="pmodal-band-sub">A tarefa segue para produção.</div>
            </section>
          ) : null}

          {/* Celular: abas Detalhes / Conversa */}
          <div className="pmodal-abas pmodal-so-mobile" role="tablist" aria-label="Seções da tarefa">
            <button
              type="button"
              role="tab"
              aria-selected={abaMobile === 'conversa'}
              className={abaMobile === 'conversa' ? 'is-on' : ''}
              onClick={() => setAbaMobile('conversa')}
            >
              Conversa
              {comments.length > 0 && <span className="pmodal-abas-n">{comments.length}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={abaMobile === 'detalhes'}
              className={abaMobile === 'detalhes' ? 'is-on' : ''}
              onClick={() => setAbaMobile('detalhes')}
            >
              Detalhes
            </button>
          </div>

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

              {anexos.length > 0 && (
                <section className="pmodal-section">
                  <div className="pmodal-lbl">Evidências · {anexos.length}</div>
                  <MiniaturasAnexos
                    anexos={anexos}
                    urls={anexoUrls}
                    tamanho="lg"
                    onAbrir={(a) => setImagemAberta(anexoUrls[a.id] ?? null)}
                  />
                </section>
              )}

              <section className="pmodal-facts">
                <div>
                  <div className="pmodal-lbl">Aberta em</div>
                  <div className="font-mono text-[13px]">
                    {task.criadoEm ? new Date(task.criadoEm).toLocaleDateString('pt-BR') : '—'}
                  </div>
                </div>
                <div>
                  <div className="pmodal-lbl">Prioridade inicial</div>
                  <div>
                    {/* Sem escolha na abertura: vale a prioridade definida pelo time */}
                    {task.prioridadeSolicitadaCliente
                      ? PRIO_CLIENTE_LABEL[task.prioridadeSolicitadaCliente]
                      : prioClienteAtual
                        ? PRIO_CLIENTE_LABEL[prioClienteAtual]
                        : '—'}
                  </div>
                </div>
              </section>
            </div>

            <div className="pmodal-col-convo">
              <div className="pmodal-lbl pmodal-convo-head">Conversa</div>
              <Conversa
                anexosPorMsg={anexosPorMsg}
                urls={anexoUrls}
                onAbrirImagem={(a) => setImagemAberta(anexoUrls[a.id] ?? null)}
                comments={comments}
                onReply={(c) => {
                  setRespondendo(c);
                  composerRef.current?.focus();
                }}
              />
              <div className="pmodal-composer">
                {respondendo && (
                  <div className="pmodal-reply-bar">
                    <div className="pmodal-reply-bar-text">
                      <b>Respondendo a {respondendo.author || (respondendo.from_cliente ? 'Cliente' : 'Time')}</b>
                      <span>{respondendo.body}</span>
                    </div>
                    <button
                      type="button"
                      className="pmodal-close"
                      onClick={() => setRespondendo(null)}
                      aria-label="Cancelar resposta"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )}
                <ImagensPendentes
                  arquivos={pendentes}
                  onRemover={(i) => setPendentes((cur) => cur.filter((_, j) => j !== i))}
                />
                <div className="tmodal-composer-pill">
                  <BotaoAnexarImagem
                    quantidadeAtual={pendentes.length}
                    disabled={!!busy}
                    onEscolher={(novas) => setPendentes((cur) => juntarPendentes(cur, novas))}
                  />
                  <textarea
                    ref={composerRef}
                    onPaste={(e) => {
                      const imgs = imagensDoClipboard(e);
                      if (!imgs.length) return;
                      e.preventDefault();
                      setPendentes((cur) => juntarPendentes(cur, imgs));
                    }}
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={1}
                    aria-label="Mensagem para o time"
                    placeholder={`Escreva ou cole um print (${atalhoColar()}) · ⌘↵ envia`}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void enviarComentario();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="tmodal-composer-send"
                    disabled={(!newComment.trim() && pendentes.length === 0) || !!busy}
                    onClick={enviarComentario}
                    title="Enviar (⌘↵)"
                    aria-label="Enviar mensagem"
                  >
                    <Icon name="send" size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <VisualizadorImagem url={imagemAberta} onFechar={() => setImagemAberta(null)} />

        {prioAberto && (
          <PedirPrioridadeDialog
            prioridadeAtual={prioClienteAtual}
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
