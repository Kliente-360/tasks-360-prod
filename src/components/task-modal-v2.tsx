'use client';

/**
 * Modal novo da tarefa (beta · nov/2026) · só a apresentação.
 *
 * Todo o estado, salvamento, conversa, anexos e cronômetro continuam no
 * TaskModal (task-modal.tsx); este componente recebe tudo por props e só
 * desenha o layout aprovado no mockup: cabeçalho com etiquetas, barra de
 * 5 etapas, faixas de ação, saída do desenvolvimento com mensagem e
 * painel lateral em abas.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icons';
import { LancamentoForm, NotePopover } from '@/components/timer-button';
import { ImagensPendentes, juntarPendentes } from '@/components/anexos-ui';
import { atalhoColar, imagensDoClipboard, MAX_POR_MENSAGEM, TIPOS_IMAGEM } from '@/lib/anexos';
import {
  AREAS_TECNICAS, AREA_LABEL, GRUPO_BACKLOG, SUB_LABELS, SUB_TO_MACRO, TIPOS_TRABALHO,
} from '@/lib/task-constants';
import type { Cliente, Pessoa, Projeto, Task, TimeEntry } from '@/lib/types';

// ============================================================
// Tipos
// ============================================================
export type AbaV2 = 'conversa' | 'detalhes' | 'horas' | 'anexos' | 'checklist' | 'historico';

type HistoricoItem = {
  id: string;
  field: string;
  from_value: string | null;
  to_value: string | null;
  occurred_at: string;
};

export type TaskModalV2Props = {
  editing: Task;
  set: <K extends keyof Task>(key: K, value: Task[K]) => void;
  setCliente: (clienteId: string) => void;
  live: Task | null;
  descricaoLoading: boolean;
  wasConcluido: boolean;
  missingFields: Set<string>;
  saveState: string;
  autosaveLabel: string;

  clientesAtivos: Cliente[];
  projetosDoCliente: Projeto[];
  pessoasNaoCliente: Pessoa[];
  clientesById: Map<string, Cliente>;
  projetosById: Map<string, Projeto>;
  pessoasById: Map<string, Pessoa>;
  tasks: Task[];
  tasksById: Map<string, Task>;

  isAdmin: boolean;
  isCEO: boolean;
  podeCronometrar: boolean;

  history: HistoricoItem[];
  nComentarios: number;
  nAnexos: number;

  jsxConversa: React.ReactNode;
  jsxAnexos: React.ReactNode;
  /** Criação: prints pendentes, sobem depois do insert */
  imagensNova: File[];
  setImagensNova: React.Dispatch<React.SetStateAction<File[]>>;
  jsxHistorico: React.ReactNode;
  jsxTimesheet: React.ReactNode;
  jsxChecklist: React.ReactNode;
  pedidoBanner: React.ReactNode;
  lightbox: React.ReactNode;

  horasLancadas: number;
  activeEntry: TimeEntry | null;
  elapsed: number;
  timerOcupado: boolean;
  onPlay: () => void;
  onStop: (nota?: string) => Promise<void>;
  onLancar: (inicio: Date, fim: Date, nota: string) => Promise<boolean>;

  onTransicao: (
    patch: Partial<Task>,
    opts?: { mensagem?: { body: string; visivel: boolean }; motivoBloqueio?: string },
  ) => Promise<boolean>;
  onLembrar: () => Promise<void>;
  onToggleRadar: () => void;
  onArquivar: () => void;
  onDesarquivar: () => void;
  onExcluir: () => void;
  onFechar: () => void;
  onFecharForcado: () => void;
  onSalvar: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
};

// ============================================================
// Constantes de apresentação
// ============================================================
const GRUPOS_SUB: { titulo: string; subs: string[] }[] = [
  { titulo: 'Backlog', subs: ['backlog', 'priorizado', 'em_definicao', 'escopo_definido'] },
  { titulo: 'Desenvolvimento', subs: ['em_desenvolvimento', 'em_revisao'] },
  { titulo: 'Homologação', subs: ['em_homologacao'] },
  { titulo: 'Entrega', subs: ['pronto_producao', 'em_implantacao', 'concluido'] },
  { titulo: 'Parada', subs: ['bloqueado'] },
];

/** Barra de 5 etapas: índice do grupo de cada subetapa. */
const ETAPAS = ['Backlog', 'Desenvolvimento', 'Homologação', 'Bloqueada', 'Concluída'] as const;
const ETAPA_DA_SUB: Record<string, number> = {
  backlog: 0, priorizado: 0, em_definicao: 0, escopo_definido: 0,
  em_desenvolvimento: 1, em_revisao: 1,
  em_homologacao: 2,
  bloqueado: 3,
  pronto_producao: 4, em_implantacao: 4, concluido: 4,
};
const EM_DESENVOLVIMENTO = new Set(['em_desenvolvimento', 'em_revisao']);
const MOSTRA_SOLUCAO = new Set(['em_homologacao', 'em_revisao', 'pronto_producao', 'em_implantacao', 'concluido']);

const PRIORIDADES: { v: Task['prioridade']; label: string }[] = [
  { v: 'P0', label: 'Urgente' },
  { v: 'P1', label: 'Alta' },
  { v: 'P2', label: 'Normal' },
  { v: 'P3', label: 'Baixa' },
];

const BLOQUEIO_LABEL: Record<string, string> = { cliente: 'Cliente', nos: 'Interno', terceiro: 'Terceiro' };

const CAMPO_LABEL: Record<string, string> = {
  clienteId: 'cliente', projetoId: 'projeto', pessoaId: 'responsável', prioridade: 'prioridade',
  prazo: 'prazo', esforco: 'esforço', tempoRealHoras: 'horas lançadas', solucaoImplementada: 'solução',
  motivoReabertura: 'motivo da reabertura',
};

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS_TRABALHO.map((t) => [t.v, t.label]));

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const ddmm = (iso: string) => iso.slice(0, 10).split('-').reverse().slice(0, 2).join('/');
const ddmmaa = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
/** Cronômetro: segundos → 0:42 · 12:05 · 1:02:33 */
const fmtCrono = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const fmtH = (h: number) => (Math.round(h * 10) / 10).toLocaleString('pt-BR');
const iniciais = (nome: string) =>
  nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

// ============================================================
// Popover ancorado (portal no body · não é cortado pelo modal)
// ============================================================
function Pop({
  anchor, open, onClose, width = 240, align = 'left', up = false, children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  width?: number;
  align?: 'left' | 'right';
  up?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) {
      setPos(null);
      return;
    }
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(width, window.innerWidth - 16);
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    if (up) {
      setPos({ left, width: w, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 16 });
    } else {
      setPos({ left, width: w, top: r.bottom + 6, maxHeight: window.innerHeight - r.bottom - 16 });
    }
  }, [open, anchor, width, align, up]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current?.contains(alvo) || anchor.current?.contains(alvo)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchor]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={ref} className="m2-pop" style={pos} role="menu">
      {children}
    </div>,
    document.body,
  );
}

function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  return { open, setOpen, ref, close: () => setOpen(false), toggle: () => setOpen((v) => !v) };
}

function Op({
  sel, onClick, children, perigo, sub,
}: {
  sel?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  perigo?: boolean;
  sub?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!sel}
      className={cn('m2-op', sel && 'sel', perigo && 'perigo')}
      onClick={onClick}
    >
      <span>{children}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

// ============================================================
// Etiquetas do cabeçalho
// ============================================================
function ChipEtapa({ editing, onEscolher }: { editing: Task; onEscolher: (s: string) => void }) {
  const p = usePop();
  const macro = SUB_TO_MACRO[editing.subetapa] ?? 'backlog';
  return (
    <>
      <button ref={p.ref} type="button" className="m2-chip" data-macro={macro} onClick={p.toggle} aria-haspopup="menu">
        <span className="m2-dot" />
        {SUB_LABELS[editing.subetapa] ?? editing.subetapa}
        <span className="m2-caret">▾</span>
      </button>
      <Pop anchor={p.ref} open={p.open} onClose={p.close} width={230}>
        {GRUPOS_SUB.map((g) => (
          <div key={g.titulo}>
            <div className="m2-grupo">{g.titulo}</div>
            {g.subs.map((s) => (
              <Op key={s} sel={editing.subetapa === s} onClick={() => { p.close(); onEscolher(s); }}>
                {SUB_LABELS[s]}
              </Op>
            ))}
          </div>
        ))}
      </Pop>
    </>
  );
}

function ChipLista<T extends string>({
  rotulo, vazio, valor, opcoes, onEscolher, icone, classe, largura = 220, permiteLimpar,
}: {
  rotulo: React.ReactNode;
  vazio: boolean;
  valor: T | '';
  opcoes: { v: T; label: string; sub?: string }[];
  onEscolher: (v: T | '') => void;
  icone?: React.ReactNode;
  classe?: string;
  largura?: number;
  permiteLimpar?: string;
}) {
  const p = usePop();
  return (
    <>
      <button
        ref={p.ref}
        type="button"
        className={cn('m2-chip', vazio && 'vazio', classe)}
        onClick={p.toggle}
        aria-haspopup="menu"
      >
        {icone}
        {rotulo}
        <span className="m2-caret">▾</span>
      </button>
      <Pop anchor={p.ref} open={p.open} onClose={p.close} width={largura}>
        {opcoes.map((o) => (
          <Op key={o.v} sel={valor === o.v} sub={o.sub} onClick={() => { p.close(); onEscolher(o.v); }}>
            {o.label}
          </Op>
        ))}
        {permiteLimpar && valor && (
          <Op onClick={() => { p.close(); onEscolher(''); }}>
            <span className="text-muted">{permiteLimpar}</span>
          </Op>
        )}
      </Pop>
    </>
  );
}

function ChipPrazo({ prazo, vencido, onChange }: { prazo: string; vencido: boolean; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <label className={cn('m2-chip relative', !prazo && 'vazio', vencido && 'danger')}>
      <Icon name="calendar" size={12} />
      {prazo ? ddmmaa(prazo) : 'Prazo'}
      <input
        ref={inputRef}
        type="date"
        className="m2-date-oculto"
        value={prazo || ''}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          const el = e.currentTarget;
          if (typeof el.showPicker === 'function') {
            try { el.showPicker(); } catch { /* sem suporte */ }
          }
        }}
        aria-label="Prazo"
      />
    </label>
  );
}

function ChipClassificacao({ editing, set }: { editing: Task; set: TaskModalV2Props['set'] }) {
  const p = usePop();
  const tipo = editing.tipoTrabalho ? TIPO_LABEL[editing.tipoTrabalho] : '';
  const area = editing.areaTecnica ? AREA_LABEL[editing.areaTecnica] : '';
  const rotulo = [tipo, area].filter(Boolean).join(' · ') || 'Tipo e área';
  return (
    <>
      <button ref={p.ref} type="button" className={cn('m2-chip', !tipo && !area && 'vazio')} onClick={p.toggle} aria-haspopup="menu">
        {rotulo}
        <span className="m2-caret">▾</span>
      </button>
      <Pop anchor={p.ref} open={p.open} onClose={p.close} width={400}>
        <div className="m2-cls">
          <div>
            <div className="m2-grupo">Tipo</div>
            {TIPOS_TRABALHO.map((t) => (
              <Op
                key={t.v}
                sel={editing.tipoTrabalho === t.v}
                onClick={() => set('tipoTrabalho', (editing.tipoTrabalho === t.v ? null : t.v) as Task['tipoTrabalho'])}
              >
                {t.label}
              </Op>
            ))}
          </div>
          <div className="m2-cls-col">
            <div className="m2-grupo">Área técnica</div>
            {AREAS_TECNICAS.map((a) => (
              <Op
                key={a.v}
                sel={editing.areaTecnica === a.v}
                onClick={() => set('areaTecnica', editing.areaTecnica === a.v ? null : a.v)}
              >
                {a.label}
              </Op>
            ))}
          </div>
        </div>
      </Pop>
    </>
  );
}

// ============================================================
// Cronômetro e lançamento de horas
// ============================================================
function LancarHoras({ onLancar }: { onLancar: TaskModalV2Props['onLancar'] }) {
  const p = usePop();
  return (
    <>
      <button ref={p.ref} type="button" className="m2-hbtn" onClick={p.toggle} title="Lançar horas já trabalhadas">
        <span className="m2-mais">+</span>
        <span className="hidden sm:inline">Lançar</span>
      </button>
      <Pop anchor={p.ref} open={p.open} onClose={p.close} width={360} align="right">
        <LancamentoForm
          onCancel={p.close}
          onConfirm={async (inicio, fim, nota) => {
            if (await onLancar(inicio, fim, nota)) p.close();
          }}
        />
      </Pop>
    </>
  );
}

function BotaoPlay(props: TaskModalV2Props) {
  const { activeEntry, editing, tasksById, elapsed, timerOcupado, onPlay, onStop } = props;
  const [nota, setNota] = useState(false);
  const aqui = activeEntry?.taskId === editing.id;
  const outra = !!activeEntry && !aqui;
  const outraTask = outra ? tasksById.get(activeEntry!.taskId) : null;
  const titulo = aqui
    ? 'Parar o cronômetro'
    : outra
      ? `Cronômetro rodando em "${outraTask?.titulo ?? 'outra tarefa'}": clique para parar`
      : 'Iniciar o cronômetro nesta tarefa';
  return (
    // Celular: sem cronômetro no modal (só Lançar); parar pela barra do app
    <span className="relative hidden md:inline-flex">
      <button
        type="button"
        className={cn('m2-hbtn', aqui && 'rodando', outra && 'outra')}
        disabled={timerOcupado}
        title={titulo}
        onClick={() => (activeEntry ? setNota(true) : onPlay())}
      >
        <span className="m2-play" />
        <span className="hidden sm:inline">{aqui ? fmtCrono(elapsed) : outra ? 'Rodando' : 'Play'}</span>
      </button>
      {nota && activeEntry && (
        <NotePopover
          onConfirm={async (n) => {
            setNota(false);
            await onStop(n || undefined);
          }}
          onCancel={() => setNota(false)}
        />
      )}
    </span>
  );
}

// ============================================================
// Saída do desenvolvimento: homologação ou bloqueio, sempre com mensagem
// ============================================================
function Saida({
  editing, modoInicial, onTransicao, onCancelar, podeCancelar, voltar,
}: {
  editing: Task;
  modoInicial: 'homolog' | 'bloq' | null;
  onTransicao: TaskModalV2Props['onTransicao'];
  onCancelar: () => void;
  podeCancelar: boolean;
  voltar?: { label: string; onClick: () => void };
}) {
  const [modo, setModo] = useState<'homolog' | 'bloq' | null>(modoInicial);
  const [por, setPor] = useState<string>('');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => setModo(modoInicial), [modoInicial]);

  const valido = msg.trim().length > 0 && (modo === 'homolog' || !!por);
  const confirmar = async () => {
    if (!valido || enviando || !modo) return;
    setEnviando(true);
    const ok =
      modo === 'homolog'
        ? await onTransicao(
            { subetapa: 'em_homologacao' },
            { mensagem: { body: msg.trim(), visivel: editing.visivelCliente !== false } },
          )
        : await onTransicao({ subetapa: 'bloqueado', bloqueadoPor: por }, { motivoBloqueio: msg.trim() });
    setEnviando(false);
    if (ok) {
      setMsg('');
      setPor('');
      setModo(null);
      onCancelar();
    }
  };

  const rotuloMsg =
    modo === 'homolog'
      ? 'Mensagem para o cliente'
      : por === 'cliente'
        ? 'Pergunta para o cliente'
        : 'Motivo do bloqueio';
  const placeholder =
    modo === 'homolog'
      ? 'O que foi entregue e como testar'
      : por === 'cliente'
        ? 'O que você precisa que o cliente responda'
        : 'O que está segurando a tarefa';

  return (
    <div className="m2-saida">
      <div className="m2-saida-t">Próximo passo</div>
      <div className="m2-opcoes" role="radiogroup">
        <button type="button" role="radio" aria-checked={modo === 'homolog'} className="m2-opcao" onClick={() => setModo('homolog')}>
          <span className="m2-op-ic"><Icon name="send" size={13} /></span>
          <b>Enviar para homologação</b>
        </button>
        <button type="button" role="radio" aria-checked={modo === 'bloq'} data-op="bloq" className="m2-opcao" onClick={() => setModo('bloq')}>
          <span className="m2-op-ic"><Icon name="alert" size={13} /></span>
          <b>Bloquear</b>
        </button>
      </div>
      {modo && (
        <div className="m2-saida-form">
          {modo === 'bloq' && (
            <div className="m2-campo">
              <span className="m2-lbl">Bloqueado por <span className="m2-req">*</span></span>
              <div className="m2-seg" role="radiogroup">
                {(['cliente', 'nos', 'terceiro'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={por === v} onClick={() => setPor(v)}>
                    {BLOQUEIO_LABEL[v]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="m2-campo">
            <span className="m2-lbl">{rotuloMsg} <span className="m2-req">*</span></span>
            <textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={placeholder} />
          </label>
        </div>
      )}
      <div className="m2-saida-pe">
        {voltar && !modo && (
          <button type="button" className="m2-link m2-voltar" onClick={voltar.onClick}>
            ← {voltar.label}
          </button>
        )}
        {(modo || podeCancelar) && (
          <button
            type="button"
            className="m2-link"
            onClick={() => { setModo(null); setMsg(''); setPor(''); onCancelar(); }}
          >
            Cancelar
          </button>
        )}
        {modo && (
          <button
            type="button"
            className={cn('m2-btn', modo === 'homolog' ? 'primario' : 'perigo')}
            disabled={!valido || enviando}
            onClick={confirmar}
          >
            {enviando ? 'Salvando…' : modo === 'homolog' ? 'Enviar para homologação' : 'Bloquear'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Passos fora do desenvolvimento: avançar e voltar de etapa
// ============================================================
const MOTIVOS_REABERTURA = [
  { v: 'mudanca_cliente', label: 'Mudança de escopo pedida pelo cliente' },
  { v: 'erro_qualidade', label: 'Erro ou problema de qualidade' },
  { v: 'regressao', label: 'Regressão (algo quebrou)' },
  { v: 'novo_requisito', label: 'Novo requisito interno' },
];

function Passos({ editing, onTransicao }: { editing: Task; onTransicao: TaskModalV2Props['onTransicao'] }) {
  const [ocupado, setOcupado] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const ir = async (patch: Partial<Task>) => {
    if (ocupado) return;
    setOcupado(true);
    const ok = await onTransicao(patch);
    setOcupado(false);
    if (ok) { setReabrindo(false); setMotivo(''); }
  };
  const sub = editing.subetapa;
  type Acao = { label: string; patch: Partial<Task>; primario?: boolean };
  let avancar: Acao[] = [];
  let voltar: Acao | null = null;
  if (GRUPO_BACKLOG.has(sub)) {
    avancar = [{ label: 'Iniciar desenvolvimento', patch: { subetapa: 'em_desenvolvimento' }, primario: true }];
  } else if (sub === 'em_homologacao') {
    avancar = [
      { label: 'Pronto para produção', patch: { subetapa: 'pronto_producao' }, primario: true },
      { label: 'Pedir ajustes', patch: { subetapa: 'em_revisao' } },
    ];
  } else if (sub === 'pronto_producao') {
    avancar = [
      { label: 'Concluir', patch: { subetapa: 'concluido' }, primario: true },
      { label: 'Em implantação', patch: { subetapa: 'em_implantacao' } },
    ];
    voltar = { label: 'Voltar para homologação', patch: { subetapa: 'em_homologacao' } };
  } else if (sub === 'em_implantacao') {
    avancar = [{ label: 'Concluir', patch: { subetapa: 'concluido' }, primario: true }];
    voltar = { label: 'Voltar para pronto para produção', patch: { subetapa: 'pronto_producao' } };
  }

  if (sub === 'concluido') {
    return (
      <div className="m2-passos">
        {!reabrindo ? (
          <button type="button" className="m2-link m2-voltar" onClick={() => setReabrindo(true)}>
            ← Reabrir
          </button>
        ) : (
          <>
            <select className="inp m2-passos-sel" value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da reabertura">
              <option value="">Motivo da reabertura</option>
              {MOTIVOS_REABERTURA.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
            <button type="button" className="m2-link" onClick={() => { setReabrindo(false); setMotivo(''); }}>Cancelar</button>
            <button
              type="button"
              className="m2-btn primario"
              disabled={!motivo || ocupado}
              onClick={() => ir({ subetapa: 'em_revisao', motivoReabertura: motivo })}
            >
              Reabrir
            </button>
          </>
        )}
      </div>
    );
  }
  if (!avancar.length && !voltar) return null;
  return (
    <div className="m2-passos">
      {voltar && (
        <button type="button" className="m2-link m2-voltar" disabled={ocupado} onClick={() => ir(voltar!.patch)}>
          ← {voltar.label}
        </button>
      )}
      <span className="m2-passos-dir">
        {avancar.map((a) => (
          <button
            key={a.label}
            type="button"
            className={cn('m2-btn', a.primario && 'primario')}
            disabled={ocupado}
            onClick={() => ir(a.patch)}
          >
            {a.label}{a.primario && ' →'}
          </button>
        ))}
      </span>
    </div>
  );
}

// ============================================================
// Rodapé: menu ··· (dependência, arquivar, excluir)
// ============================================================
function MenuMais(props: TaskModalV2Props) {
  const { editing, isAdmin, onArquivar, onDesarquivar, onExcluir, set, tasks } = props;
  const p = usePop();
  const [modo, setModo] = useState<'menu' | 'dep'>('menu');
  const [busca, setBusca] = useState('');
  const candidatas = useMemo(() => {
    if (modo !== 'dep') return [];
    const q = busca.trim().toLowerCase();
    return tasks
      .filter(
        (t) =>
          t.id !== editing.id &&
          !t.arquivadoEm &&
          t.status !== 'concluido' &&
          t.clienteId === editing.clienteId &&
          !editing.bloqueadaPorTasks.includes(t.id) &&
          (!q || t.titulo.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [modo, busca, tasks, editing.id, editing.clienteId, editing.bloqueadaPorTasks]);

  return (
    <>
      <button
        ref={p.ref}
        type="button"
        className="m2-mais-menu"
        onClick={() => { setModo('menu'); setBusca(''); p.toggle(); }}
        aria-label="Mais ações"
        title="Mais ações"
      >
        ···
      </button>
      <Pop anchor={p.ref} open={p.open} onClose={p.close} width={modo === 'dep' ? 320 : 230} up>
        {modo === 'menu' ? (
          <>
            <Op onClick={() => setModo('dep')}>Marcar dependência</Op>
            {editing.arquivadoEm ? (
              <Op onClick={() => { p.close(); onDesarquivar(); }}>Desarquivar</Op>
            ) : (
              <Op onClick={() => { p.close(); onArquivar(); }}>Arquivar</Op>
            )}
            {isAdmin && (
              <Op perigo onClick={() => { p.close(); onExcluir(); }}>Excluir</Op>
            )}
          </>
        ) : (
          <div className="m2-dep">
            <input
              className="m2-inp"
              placeholder={editing.clienteId ? 'Buscar tarefa do mesmo cliente' : 'Escolha o cliente antes'}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              disabled={!editing.clienteId}
              autoFocus
            />
            <div className="m2-dep-lista">
              {candidatas.map((t) => (
                <Op
                  key={t.id}
                  sub={SUB_LABELS[t.subetapa]}
                  onClick={() => {
                    set('bloqueadaPorTasks', [...editing.bloqueadaPorTasks, t.id]);
                    p.close();
                  }}
                >
                  {t.titulo}
                </Op>
              ))}
              {editing.clienteId && candidatas.length === 0 && (
                <div className="m2-hint px-2 py-1.5">Nenhuma tarefa aberta encontrada.</div>
              )}
            </div>
          </div>
        )}
      </Pop>
    </>
  );
}

// ============================================================
// Modal
// ============================================================
export function TaskModalV2(props: TaskModalV2Props) {
  const {
    editing, set, setCliente, live, descricaoLoading, wasConcluido, missingFields, saveState,
    clientesAtivos, projetosDoCliente, pessoasNaoCliente, clientesById, projetosById, pessoasById, tasksById,
    isCEO, podeCronometrar, history, nComentarios, nAnexos,
    jsxConversa, jsxAnexos, jsxHistorico, jsxTimesheet, jsxChecklist, pedidoBanner, lightbox,
    horasLancadas, onTransicao, onLembrar, onToggleRadar, onFechar, onFecharForcado, onSalvar, onPaste,
    imagensNova, setImagensNova,
  } = props;
  const inputImagensRef = useRef<HTMLInputElement | null>(null);

  const nova = !editing.id;
  const [aba, setAba] = useState<AbaV2>('detalhes');
  const [saidaPedida, setSaidaPedida] = useState<'homolog' | 'bloq' | null>(null);
  const [lembrando, setLembrando] = useState(false);
  const novoPrazoRef = useRef<HTMLInputElement | null>(null);

  const cliente = editing.clienteId ? clientesById.get(editing.clienteId) : undefined;
  const projeto = editing.projetoId ? projetosById.get(editing.projetoId) : undefined;
  const responsavel = editing.pessoaId ? pessoasById.get(editing.pessoaId) : undefined;
  // Privada herdada do cliente ou do projeto (só o CEO marca no Cadastros)
  const privadaHerdada = cliente?.privado ? 'do cliente' : projeto?.privado ? 'do projeto' : null;
  const privadaEfetiva = editing.privada || !!privadaHerdada;
  const hoje = hojeIso();
  const concluida = editing.subetapa === 'concluido';
  const vencido = !!editing.prazo && editing.prazo < hoje && !concluida;
  const emDev = EM_DESENVOLVIMENTO.has(editing.subetapa);
  const mostraSaida = !nova && (emDev || saidaPedida !== null) && editing.subetapa !== 'bloqueado';
  const checklistFeitos = editing.checklist.filter((i) => i.done).length;

  // Subetapa anterior ao bloqueio (para o Desbloquear)
  const antesDoBloqueio = useMemo(() => {
    const h = history.find((x) => x.field === 'subetapa' && x.to_value === 'bloqueado' && x.from_value);
    return h?.from_value && h.from_value !== 'bloqueado' ? h.from_value : 'em_desenvolvimento';
  }, [history]);
  // Memória: última subetapa do Backlog antes de ir para o desenvolvimento
  const ultimaDoBacklog = useMemo(() => {
    const h = history.find(
      (x) => x.field === 'subetapa' && x.from_value && GRUPO_BACKLOG.has(x.from_value) && !GRUPO_BACKLOG.has(x.to_value ?? ''),
    );
    return h?.from_value ?? 'escopo_definido';
  }, [history]);
  const bloqueadaDesde = useMemo(() => {
    const h = history.find((x) => x.field === 'subetapa' && x.to_value === 'bloqueado');
    return h?.occurred_at ?? null;
  }, [history]);

  // Barra de etapas
  const etapaAtual = ETAPA_DA_SUB[editing.subetapa] ?? 0;
  const etapaBase = editing.subetapa === 'bloqueado' ? (ETAPA_DA_SUB[antesDoBloqueio] ?? 1) : etapaAtual;

  const escolherEtapa = (s: string) => {
    if (s === editing.subetapa) return;
    if (!nova && s === 'bloqueado') { setSaidaPedida('bloq'); setAba('detalhes'); return; }
    if (!nova && s === 'em_homologacao') { setSaidaPedida('homolog'); setAba('detalhes'); return; }
    if (s === 'bloqueado') set('bloqueadoPor', editing.bloqueadoPor || 'nos');
    set('subetapa', s);
  };

  const homologDias = editing.homologacaoEm
    ? Math.max(0, Math.floor((Date.now() - editing.homologacaoEm) / 86_400_000))
    : null;

  const faltam = [...missingFields].map((f) => CAMPO_LABEL[f] ?? f);
  const esforco = Number(editing.esforco) || 0;
  const estourou = esforco > 0 && horasLancadas > esforco;
  // Estimativa trava na primeira saída do Backlog (esforco_inicial preenchido), mesmo se voltar
  const esforcoTravado = !nova && (!GRUPO_BACKLOG.has(editing.subetapa) || editing.esforcoInicial != null);

  // ---------- Cabeçalho ----------
  const cabecalho = (
    <div className="m2-head">
      <div className="m2-head-main">
        <div className="m2-eyebrow">
          {nova ? (cliente ? `${cliente.nome} · Nova tarefa` : 'Nova tarefa') : (cliente?.nome ?? 'Sem cliente')}
          {editing.criadoPorCliente && <span> · aberta pelo cliente</span>}
          {editing.criadoPorIa && <span> · criada por IA</span>}
          {(editing.reopenCount || 0) > 0 && <span> · reaberta {editing.reopenCount}x</span>}
          {editing.arquivadoEm && <span> · arquivada</span>}
        </div>
        {nova ? (
          <h2 className="m2-title m2-title-nova">{editing.titulo.trim() || 'Nova tarefa'}</h2>
        ) : (
        <input
          className="m2-title"
          value={editing.titulo}
          onChange={(e) => set('titulo', e.target.value)}
          placeholder="O que precisa ser feito?"
          aria-label="Título da tarefa"
        />
        )}
      </div>
      <div className="m2-head-actions">
        {!nova && (
          <button
            type="button"
            className={cn('m2-htotal', estourou && 'estourou')}
            onClick={() => setAba('horas')}
            title="Horas lançadas e estimativa"
          >
            <b>{fmtH(horasLancadas)} h</b>
            {esforco > 0 && <> de {fmtH(esforco)} h</>}
          </button>
        )}
        {!nova && podeCronometrar && <BotaoPlay {...props} />}
        {!nova && podeCronometrar && <LancarHoras onLancar={props.onLancar} />}
        <button type="button" className="m2-close" aria-label="Fechar" onClick={onFecharForcado}>
          <Icon name="x" size={18} />
        </button>
      </div>
    </div>
  );

  // ---------- Etiquetas ----------
  const etiquetas = !nova && (
    <div className="m2-chips">
      <ChipLista
        rotulo={projeto?.nome ?? 'Projeto'}
        vazio={!projeto}
        valor={editing.projetoId}
        opcoes={projetosDoCliente.map((p) => ({ v: p.id, label: p.nome }))}
        onEscolher={(v) => set('projetoId', v)}
        icone={<Icon name="folder" size={12} />}
      />
      <ChipEtapa editing={editing} onEscolher={escolherEtapa} />
      <ChipLista
        rotulo={responsavel ? responsavel.nome.split(' ')[0] : 'Responsável'}
        vazio={!responsavel}
        valor={editing.pessoaId}
        opcoes={pessoasNaoCliente.map((p) => ({ v: p.id, label: p.nome }))}
        onEscolher={(v) => set('pessoaId', v)}
        icone={responsavel ? <span className="m2-avatar">{iniciais(responsavel.nome)}</span> : <Icon name="user-plus" size={12} />}
      />
      <ChipLista
        rotulo={editing.prioridade || 'Prioridade'}
        vazio={!editing.prioridade}
        classe={editing.prioridade ? `m2-pri pri-${editing.prioridade}` : undefined}
        valor={editing.prioridade}
        opcoes={PRIORIDADES.map((p) => ({ v: p.v, label: `${p.v} · ${p.label}` }))}
        onEscolher={(v) => set('prioridade', v as Task['prioridade'])}
        icone={editing.prioridade ? <span className="m2-dot" /> : undefined}
        largura={170}
      />
      <ChipPrazo prazo={editing.prazo} vencido={vencido} onChange={(v) => set('prazo', v)} />
      <ChipClassificacao editing={editing} set={set} />
      {editing.bloqueadaPorTasks.map((id) => {
        const dep = tasksById.get(id);
        const aberta = dep && dep.status !== 'concluido' && !dep.arquivadoEm;
        return (
          <span key={id} className={cn('m2-chip', aberta ? 'warn' : 'ok')} title={aberta ? 'Ainda aberta: segura a conclusão' : 'Já concluída'}>
            Depende de: {dep?.titulo ?? id.slice(0, 8)}
            <button
              type="button"
              className="m2-dep-x"
              aria-label="Remover dependência"
              onClick={() => set('bloqueadaPorTasks', editing.bloqueadaPorTasks.filter((x) => x !== id))}
            >
              ×
            </button>
          </span>
        );
      })}
      <button
        type="button"
        className="m2-chip m2-vis"
        aria-pressed={editing.visivelCliente !== false}
        onClick={() => set('visivelCliente', editing.visivelCliente === false)}
        title={editing.visivelCliente !== false ? 'O cliente vê esta tarefa no portal' : 'Oculta do cliente'}
      >
        <Icon name={editing.visivelCliente !== false ? 'eye' : 'eye-off'} size={12} />
        {editing.visivelCliente !== false ? 'Visível ao cliente' : 'Oculta do cliente'}
      </button>
      {privadaHerdada ? (
        <span className="m2-chip m2-priv" aria-pressed="true" title={`Privada porque o ${privadaHerdada.slice(3)} é privado`}>
          <Icon name="lock" size={12} /> Privada {privadaHerdada}
        </span>
      ) : isCEO ? (
        <button
          type="button"
          className="m2-chip m2-priv"
          aria-pressed={editing.privada}
          onClick={() => set('privada', !editing.privada)}
          title={editing.privada ? 'Só você e o responsável veem esta tarefa' : 'O time vê esta tarefa'}
        >
          <Icon name="lock" size={12} /> {editing.privada ? 'Privada' : 'Pública'}
        </button>
      ) : (
        privadaEfetiva && (
          <span className="m2-chip m2-priv" aria-pressed="true">
            <Icon name="lock" size={12} /> Privada
          </span>
        )
      )}
      {isCEO ? (
        <button type="button" className="m2-chip m2-radar" aria-pressed={editing.radar} onClick={onToggleRadar}>
          <Icon name="target" size={12} /> Radar
        </button>
      ) : (
        editing.radar && (
          <span className="m2-chip m2-radar" aria-pressed="true">
            <Icon name="target" size={12} /> Radar
          </span>
        )
      )}
    </div>
  );

  // ---------- Barra de etapas ----------
  const barra = !nova && (
    <ol className="m2-steps">
      {ETAPAS.map((nome, i) => {
        const bloqueada = editing.subetapa === 'bloqueado';
        let estado: 'done' | 'cur' | 'parada' | 'pausa' | '' = '';
        if (i === 3) estado = bloqueada ? 'parada' : 'pausa';
        else if (bloqueada) estado = i < etapaBase ? 'done' : '';
        else if (concluida) estado = 'done';
        else if (i < etapaAtual) estado = 'done';
        else if (i === etapaAtual) estado = 'cur';
        return (
          <li key={nome} className={cn('m2-step', estado)}>
            <div className="m2-track">
              <span className="m2-sdot">{estado === 'done' && <Icon name="check" size={11} />}</span>
              {i < ETAPAS.length - 1 && <span className="m2-sline" />}
            </div>
            <span className="m2-sname">{nome}</span>
            {(estado === 'cur' || estado === 'parada') && (
              <span className="m2-sdate">{SUB_LABELS[editing.subetapa]}</span>
            )}
          </li>
        );
      })}
    </ol>
  );

  // Celular: linha do tempo compacta (bolinhas) + texto da etapa, acima das abas
  const barraMob = !nova && (
    <div className="m2-steps-mob" aria-label={`Etapa: ${SUB_LABELS[editing.subetapa] ?? editing.subetapa}`}>
      <div className="m2-cs-linha">
        {ETAPAS.map((nome, i) => {
          const bloqueada = editing.subetapa === 'bloqueado';
          let estado = '';
          if (i === 3) estado = bloqueada ? 'parada' : 'pausa';
          else if (bloqueada) estado = i < etapaBase ? 'done' : '';
          else if (concluida || i < etapaAtual) estado = 'done';
          else if (i === etapaAtual) estado = 'cur';
          const linhaFeita = !bloqueada && (concluida || i < etapaAtual);
          return (
            <span key={nome} className="contents">
              <span className={cn('m2-cs', estado)} title={nome} />
              {i < ETAPAS.length - 1 && <span className={cn('m2-cl', linhaFeita && 'done')} />}
            </span>
          );
        })}
      </div>
      <div className={cn('m2-cs-txt', editing.subetapa === 'bloqueado' && 'parada', concluida && 'ok')}>
        {ETAPAS[etapaAtual]}
        {SUB_LABELS[editing.subetapa] && SUB_LABELS[editing.subetapa] !== ETAPAS[etapaAtual] && ` · ${SUB_LABELS[editing.subetapa]}`}
      </div>
    </div>
  );

  // ---------- Faixas ----------
  const faixas = (
    <>
      {pedidoBanner}
      {saveState === 'error' && (
        <div className="m2-band erro">
          <div className="grow">
            <div className="bt">Não foi possível salvar</div>
          </div>
        </div>
      )}
      {!nova && editing.subetapa === 'bloqueado' && (
        <div className="m2-band erro">
          <div className="grow">
            <div className="bt">
              Bloqueada por {BLOQUEIO_LABEL[editing.bloqueadoPor] ?? 'quem?'}
              {bloqueadaDesde && <span className="m2-band-data"> desde {ddmm(bloqueadaDesde)}</span>}
            </div>
            {editing.bloqueadoPor === 'cliente' && live?.pendenciaRespondidaEm ? (
              <p>O cliente respondeu em {new Date(live.pendenciaRespondidaEm).toLocaleDateString('pt-BR')}. Veja a conversa e desbloqueie quando puder seguir.</p>
            ) : null}
            {!editing.bloqueadoPor && (
              <div className="m2-seg mt-2" role="radiogroup">
                {(['cliente', 'nos', 'terceiro'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={false} onClick={() => set('bloqueadoPor', v)}>
                    {BLOQUEIO_LABEL[v]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="m2-btn"
            onClick={() => onTransicao({ subetapa: antesDoBloqueio, bloqueadoPor: '' })}
          >
            Desbloquear
          </button>
        </div>
      )}
      {!nova && editing.subetapa === 'em_homologacao' && !editing.aprovadoEm && (
        <div className="m2-band">
          <div className="grow">
            <div className="bt">
              {homologDias === null ? 'Com o cliente' : homologDias === 0 ? 'Com o cliente desde hoje' : `Com o cliente há ${homologDias} ${homologDias === 1 ? 'dia' : 'dias'}`}
            </div>
          </div>
          {editing.visivelCliente !== false && (
            <button
              type="button"
              className="m2-btn"
              disabled={lembrando}
              onClick={async () => {
                setLembrando(true);
                await onLembrar();
                setLembrando(false);
              }}
            >
              {lembrando ? 'Enviando…' : 'Lembrar o cliente'}
            </button>
          )}
        </div>
      )}
      {!nova && !!editing.aprovadoEm && !concluida && (
        <div className="m2-band ok">
          <div className="grow">
            <div className="bt">
              Aprovada pelo cliente em {new Date(editing.aprovadoEm).toLocaleDateString('pt-BR')}
            </div>
          </div>
        </div>
      )}
      {!nova && vencido && (
        <div className="m2-band">
          <div className="grow">
            <div className="bt">Prazo vencido em {ddmmaa(editing.prazo)}</div>
          </div>
          <label className="m2-btn relative">
            Novo prazo
            <input
              ref={novoPrazoRef}
              type="date"
              className="m2-date-oculto"
              min={hoje}
              value={editing.prazo}
              onChange={(e) => set('prazo', e.target.value)}
              onClick={(e) => {
                const el = e.currentTarget;
                if (typeof el.showPicker === 'function') {
                  try { el.showPicker(); } catch { /* sem suporte */ }
                }
              }}
              aria-label="Novo prazo"
            />
          </label>
        </div>
      )}
      {!nova && faltam.length > 0 && editing.subetapa !== 'bloqueado' && (
        <div className="m2-band">
          <div className="grow">
            <div className="bt">Falta: {faltam.join(', ')}</div>
          </div>
        </div>
      )}
    </>
  );

  // ---------- Coluna principal ----------
  const selCliente = (
    <label className="m2-campo">
      <span className="m2-lbl">Cliente <span className="m2-req">*</span></span>
      <select className="inp" value={editing.clienteId} onChange={(e) => setCliente(e.target.value)}>
        <option value="">Escolher</option>
        {clientesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
    </label>
  );

  const principal = (
    <div className="m2-main">
      {barra}
      <div className="m2-faixas">{faixas}</div>
      {mostraSaida ? (
        <Saida
          editing={editing}
          modoInicial={saidaPedida}
          onTransicao={onTransicao}
          onCancelar={() => setSaidaPedida(null)}
          podeCancelar={!emDev}
          voltar={emDev ? { label: 'Voltar para o Backlog', onClick: () => onTransicao({ subetapa: ultimaDoBacklog }) } : undefined}
        />
      ) : (
        !nova && <Passos editing={editing} onTransicao={onTransicao} />
      )}

      <section className="m2-sec">
        <div className="m2-lbl">Solicitação</div>
        <textarea
          className="inp m2-area"
          rows={4}
          value={descricaoLoading ? '' : (editing.descricao ?? '')}
          onChange={(e) => set('descricao', e.target.value)}
          placeholder={descricaoLoading ? 'Carregando…' : 'Contexto, links, o que o cliente pediu'}
          disabled={descricaoLoading}
        />
        <label className="m2-campo m2-valor">
          <span className="m2-lbl">Valor esperado</span>
          <textarea
            className="inp m2-area"
            rows={2}
            value={descricaoLoading ? '' : (editing.valorEsperado ?? '')}
            onChange={(e) => set('valorEsperado', e.target.value)}
            placeholder={descricaoLoading ? 'Carregando…' : 'O que muda para o cliente quando isso estiver pronto'}
            disabled={descricaoLoading}
          />
        </label>
      </section>

      {!nova && MOSTRA_SOLUCAO.has(editing.subetapa) && (
        <section className="m2-sec">
          <div className="m2-lbl">
            Solução implementada {concluida && <span className="m2-req">*</span>}
          </div>
          <textarea
            className={cn('inp m2-area', missingFields.has('solucaoImplementada') && 'is-missing')}
            rows={3}
            value={descricaoLoading ? '' : (editing.solucaoImplementada ?? '')}
            onChange={(e) => set('solucaoImplementada', e.target.value)}
            placeholder={descricaoLoading ? 'Carregando…' : 'O que foi feito de fato'}
            disabled={descricaoLoading}
          />
        </section>
      )}

      {wasConcluido && (
        <section className="m2-sec">
          <div className="m2-lbl">Motivo da reabertura <span className="m2-req">*</span></div>
          <select
            className={cn('inp', missingFields.has('motivoReabertura') && 'is-missing')}
            value={editing.motivoReabertura ?? ''}
            onChange={(e) => set('motivoReabertura', e.target.value)}
          >
            <option value="">Escolher</option>
            <option value="mudanca_cliente">Mudança de escopo pedida pelo cliente</option>
            <option value="erro_qualidade">Erro ou problema de qualidade</option>
            <option value="regressao">Regressão (algo quebrou)</option>
            <option value="novo_requisito">Novo requisito interno</option>
          </select>
        </section>
      )}
    </div>
  );

  // ---------- Criação (no estilo do formulário do portal) ----------
  const addImagens = (files: File[]) => setImagensNova((cur) => juntarPendentes(cur, files));
  const formNova = (
    <div className="m2-main m2-nova-form">
      <label className="m2-campo">
        <span className="m2-lbl">Título <span className="m2-req">*</span></span>
        <input
          className="inp"
          value={editing.titulo}
          onChange={(e) => set('titulo', e.target.value)}
          placeholder="O que precisa ser feito?"
          autoFocus
        />
      </label>
      <div className="m2-grid2 m2-grid3">
        {selCliente}
        <label className="m2-campo">
          <span className="m2-lbl">Projeto</span>
          <select className="inp" value={editing.projetoId} disabled={!editing.clienteId} onChange={(e) => set('projetoId', e.target.value)}>
            <option value="">Escolher</option>
            {projetosDoCliente.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="m2-campo">
          <span className="m2-lbl">Responsável</span>
          <select className="inp" value={editing.pessoaId} onChange={(e) => set('pessoaId', e.target.value)}>
            <option value="">Escolher</option>
            {pessoasNaoCliente.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <label className="m2-campo">
          <span className="m2-lbl">Prioridade</span>
          <select className="inp" value={editing.prioridade} onChange={(e) => set('prioridade', e.target.value as Task['prioridade'])}>
            <option value="">Escolher</option>
            {PRIORIDADES.map((p) => <option key={p.v} value={p.v}>{p.v} · {p.label}</option>)}
          </select>
        </label>
        <label className="m2-campo">
          <span className="m2-lbl">Prazo</span>
          <input type="date" className="inp" value={editing.prazo} onChange={(e) => set('prazo', e.target.value)} />
        </label>
        <label className="m2-campo">
          <span className="m2-lbl">Tipo</span>
          <select className="inp" value={editing.tipoTrabalho ?? ''} onChange={(e) => set('tipoTrabalho', (e.target.value || null) as Task['tipoTrabalho'])}>
            <option value="">Escolher</option>
            {TIPOS_TRABALHO.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </label>
        <label className="m2-campo m2-span2">
          <span className="m2-lbl">Área técnica</span>
          <select className="inp" value={editing.areaTecnica ?? ''} onChange={(e) => set('areaTecnica', e.target.value || null)}>
            <option value="">Sem área</option>
            {AREAS_TECNICAS.map((a) => <option key={a.v} value={a.v}>{a.label} · {a.exemplos}</option>)}
          </select>
        </label>
        <label className="m2-campo">
          <span className="m2-lbl">Esforço estimado (h)</span>
          <input
            type="number"
            min={0}
            step={0.5}
            className="inp"
            value={editing.esforco || ''}
            onChange={(e) => set('esforco', Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <label className="m2-campo">
        <span className="m2-lbl">Solicitação</span>
        <textarea
          className="inp m2-area"
          rows={4}
          value={editing.descricao ?? ''}
          onChange={(e) => set('descricao', e.target.value)}
          placeholder="Contexto, o que o cliente pediu, exemplos e links."
        />
      </label>
      <div className="m2-campo">
        <span className="m2-lbl">
          Prints <span className="m2-lbl-dica">(clique abaixo ou cole o print ({atalhoColar()}) enquanto escreve a solicitação)</span>
        </span>
        <div className="pmodal-imagens">
          <ImagensPendentes arquivos={imagensNova} onRemover={(i) => setImagensNova((cur) => cur.filter((_, j) => j !== i))} />
          {imagensNova.length < MAX_POR_MENSAGEM && (
            <button type="button" className="pmodal-imagens-btn" onClick={() => inputImagensRef.current?.click()}>
              <Icon name="paperclip" size={14} />
              Adicionar imagem
            </button>
          )}
          <input
            ref={inputImagensRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []).filter((f) => TIPOS_IMAGEM.test(f.type));
              if (files.length) addImagens(files);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <label className="m2-campo m2-valor">
        <span className="m2-lbl">Valor esperado</span>
        <textarea
          className="inp m2-area"
          rows={2}
          value={editing.valorEsperado ?? ''}
          onChange={(e) => set('valorEsperado', e.target.value)}
          placeholder="O que muda para o cliente quando isso estiver pronto"
        />
      </label>
    </div>
  );

  // ---------- Painel lateral ----------
  const abasLado: { k: AbaV2; label: string; n?: string | number | null }[] = [
    { k: 'conversa', label: 'Conversa', n: nComentarios || null },
    { k: 'horas', label: 'Horas', n: horasLancadas > 0 ? `${fmtH(horasLancadas)}h` : null },
    { k: 'anexos', label: 'Anexos', n: nAnexos || null },
    { k: 'checklist', label: 'Checklist', n: editing.checklist.length ? `${checklistFeitos}/${editing.checklist.length}` : null },
    { k: 'historico', label: 'Histórico' },
  ];
  const abaLado: AbaV2 = aba === 'detalhes' ? 'conversa' : aba;

  const painelHoras = (
    <div className="m2-pad">
      <div className="m2-horas">
        <div className="m2-horas-topo">
          <span>
            <span className="m2-num">{fmtH(horasLancadas)} h</span>
            <span className="m2-de"> lançadas{esforco > 0 ? ` de ${fmtH(esforco)} h estimadas` : ''}</span>
          </span>
        </div>
        {esforco > 0 && (
          <div className="m2-barra">
            <i style={{ width: `${Math.min(100, (horasLancadas / esforco) * 100)}%`, background: estourou ? 'var(--danger)' : undefined }} />
          </div>
        )}
      </div>
      {!esforcoTravado && (
        <label className="m2-campo">
          <span className="m2-lbl">
            Estimado (h) {missingFields.has('esforco') && <span className="m2-req">*</span>}
          </span>
          <input
            type="number"
            min={0}
            step={0.5}
            className={cn('inp', missingFields.has('esforco') && 'is-missing')}
            value={editing.esforco || ''}
            onChange={(e) => set('esforco', Number(e.target.value) || 0)}
          />
        </label>
      )}
      {jsxTimesheet}
    </div>
  );

  const lado = (
    <div className="m2-side">
      <div className="m2-tabs m2-tabs-desk" role="tablist">
        {abasLado.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={abaLado === t.k} onClick={() => setAba(t.k)}>
            {t.label}
            {t.n != null && <span className="n">{t.n}</span>}
          </button>
        ))}
      </div>
      <div className="m2-painel">
        {abaLado === 'conversa' && jsxConversa}
        {abaLado === 'horas' && (nova ? <div className="m2-pad m2-hint">Horas aparecem depois de criar a tarefa.</div> : painelHoras)}
        {abaLado === 'anexos' && jsxAnexos}
        {abaLado === 'checklist' && <div className="m2-pad">{jsxChecklist}</div>}
        {abaLado === 'historico' && jsxHistorico}
      </div>
    </div>
  );

  const abasMobile: { k: AbaV2; label: string }[] = nova
    ? [{ k: 'detalhes', label: 'Detalhes' }, { k: 'checklist', label: 'Checklist' }]
    : [
        { k: 'detalhes', label: 'Detalhes' },
        { k: 'conversa', label: 'Conversa' },
        { k: 'horas', label: 'Horas' },
        { k: 'anexos', label: 'Anexos' },
        { k: 'checklist', label: 'Checklist' },
        { k: 'historico', label: 'Histórico' },
      ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center modal-bg md:p-4 md:pt-[4dvh]"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (saveState === 'error') return;
        onFechar();
      }}
      onPaste={(e) => {
        if (!nova) { onPaste(e); return; }
        const imgs = imagensDoClipboard(e);
        if (!imgs.length) return;
        e.preventDefault();
        addImagens(imgs);
      }}
    >
      <div className={cn('m2', nova && 'm2-nova')} role="dialog" aria-label={nova ? 'Nova tarefa' : 'Editar tarefa'} data-aba={aba}>
        {cabecalho}
        {etiquetas}
        {barraMob}
        {!nova && <div className="m2-tabs m2-tabs-mob" role="tablist">
          {abasMobile.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={aba === t.k} onClick={() => setAba(t.k)}>
              {t.label}
            </button>
          ))}
        </div>}
        {nova ? (
          <div className="m2-body m2-body-nova">{formNova}</div>
        ) : (
          <div className="m2-body">
            {principal}
            {lado}
          </div>
        )}
        {!nova && emDev && aba !== 'detalhes' && (
          <button type="button" className="m2-proximo-mob" onClick={() => setAba('detalhes')}>
            Próximo passo: homologação ou bloqueio
          </button>
        )}
        <div className="m2-foot">
          {!nova && <MenuMais {...props} />}
          {nova && privadaHerdada && (
            <span className="m2-chip m2-priv" aria-pressed="true">
              <Icon name="lock" size={12} /> Privada {privadaHerdada}
            </span>
          )}
          {nova && isCEO && !privadaHerdada && (
            <button
              type="button"
              className="m2-chip m2-priv"
              aria-pressed={editing.privada}
              onClick={() => set('privada', !editing.privada)}
              title={editing.privada ? 'Só você vê esta tarefa' : 'O time vê esta tarefa'}
            >
              <Icon name="lock" size={12} /> {editing.privada ? 'Privada' : 'Pública'}
            </button>
          )}
          {!nova && (
            <span className="m2-auto" data-state={saveState}>
              {props.autosaveLabel}
            </span>
          )}
          <span className="m2-foot-dir">
            <button type="button" className="m2-btn" onClick={onFecharForcado}>Fechar</button>
            <button type="button" className="m2-btn primario" onClick={onSalvar}>
              {nova ? 'Criar tarefa' : 'Salvar'}
            </button>
          </span>
        </div>
      </div>
      {lightbox}
    </div>
  );
}
