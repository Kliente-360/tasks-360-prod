'use client';
import { track } from '@/lib/telemetry';

/**
 * Nova solicitação · cliente abre task pelo Portal (mesmo padrão visual do
 * modal da task · classes pmodal-*).
 *
 * Cai na Triagem do time (não direto no backlog): task criada com
 * `criado_por_cliente=true`, `triada_em=null`, sem `pessoa_id`,
 * `visivel_cliente=true`, `subetapa='backlog'`. RLS `tasks_cliente_insert`
 * valida tudo isso no banco.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { Icon } from '@/components/icons';
import { TIPOS_TRABALHO } from '@/lib/task-constants';
import { taskFromDb } from '@/lib/adapters';
import { enviarImagem, imagensDoClipboard, MAX_POR_MENSAGEM, TIPOS_IMAGEM } from '@/lib/anexos';
import { ImagensPendentes, juntarPendentes } from '@/components/anexos-ui';

type TipoTrabalho = (typeof TIPOS_TRABALHO)[number]['v'];
type PrioCliente = 'baixa' | 'media' | 'alta' | 'urgente';

const PRIORIDADES: { v: PrioCliente; label: string }[] = [
  { v: 'baixa', label: 'Baixa' },
  { v: 'media', label: 'Média' },
  { v: 'alta', label: 'Alta' },
  { v: 'urgente', label: 'Urgente' },
];

export function PortalNewTaskForm({
  clienteId,
  onClose,
}: {
  clienteId: string;
  onClose: () => void;
}) {
  const { projetos, clientes, upsertTask, currentPessoa } = useData();
  const toast = useToastSafe();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorEsperado, setValorEsperado] = useState('');
  const [projetoId, setProjetoId] = useState('');
  const [tipo, setTipo] = useState<TipoTrabalho | ''>('');
  const [prioridade, setPrioridade] = useState<PrioCliente | ''>('');
  const [imagens, setImagens] = useState<File[]>([]);
  const inputImagens = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const projetosCliente = projetos.filter((p) => p.clienteId === clienteId && !p.arquivadoEm);
  const clienteNome = clientes.find((c) => c.id === clienteId)?.nome ?? '';
  // Todos obrigatórios, exceto a prioridade
  const podeEnviar =
    !!titulo.trim() && !!projetoId && !!tipo && !!descricao.trim() && !!valorEsperado.trim() && !pending;

  // Projeto único: já vem selecionado
  useEffect(() => {
    if (!projetoId && projetosCliente.length === 1) setProjetoId(projetosCliente[0].id);
  }, [projetoId, projetosCliente]);

  useEffect(() => {
    track('solicitacao_abrir');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(() => {
    if (!podeEnviar) return;
    setErr(null);
    startTransition(async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await createClient()
        .from('tasks')
        .insert({
          titulo: titulo.trim(),
          descricao: descricao.trim(),
          valor_esperado: valorEsperado.trim(),
          cliente_id: clienteId,
          projeto_id: projetoId,
          pessoa_id: null,
          prioridade: null,
          prioridade_solicitada_cliente: prioridade || null,
          tipo_trabalho: tipo,
          status: 'backlog',
          subetapa: 'backlog',
          visivel_cliente: true,
          criado_por_cliente: true,
          privada: false,
          triada_em: null,
          status_em: nowIso,
          subetapa_em: nowIso,
        })
        .select()
        .single();
      if (error || !data) {
        setErr(error?.message || 'Não foi possível enviar. Tente novamente.');
        return;
      }
      upsertTask(taskFromDb(data as Record<string, unknown>));
      // Prints da solicitação: anexos da task, visíveis ao cliente
      const novaId = String((data as { id: string }).id);
      for (const file of imagens) {
        const r = await enviarImagem(createClient(), {
          taskId: novaId,
          file,
          autorPessoaId: currentPessoa?.id ?? null,
          visivelCliente: true,
        });
        if (r.erro) toast.error(r.erro);
      }
      if (imagens.length) track('anexo_imagem', { task_id: novaId, props: { portal: true, qtd: imagens.length, origem: 'solicitacao' } });
      track('solicitacao_criada', { task_id: String((data as { id: string }).id), props: { tipo, prioridade: prioridade || null } });
      toast.success('Solicitação enviada.');
      onClose();
    });
  }, [podeEnviar, titulo, descricao, valorEsperado, projetoId, prioridade, tipo, clienteId, upsertTask, toast, onClose, imagens, currentPessoa?.id]);

  return createPortal(
    <div className="pmodal-backdrop" onClick={onClose}>
      <div
        className="pmodal pmodal-narrow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-sol-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pmodal-head">
          <div className="pmodal-head-main">
            {clienteNome && <div className="pmodal-eyebrow">{clienteNome}</div>}
            <h1 id="nova-sol-title" className="pmodal-title">
              Nova solicitação
            </h1>
          </div>
          <button type="button" className="pmodal-close" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={20} />
          </button>
        </header>

        <div className="pmodal-scroll">
          <div className="pmodal-form">
            <div className="pmodal-field">
              <label htmlFor="ns-titulo">Título <span className="pmodal-req" aria-hidden="true">*</span></label>
              <input
                id="ns-titulo"
                required
                aria-required="true"
                type="text"
                className="inp"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Resumo curto do que você precisa"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="pmodal-form-row">
              <div className="pmodal-field">
                <label htmlFor="ns-projeto">Projeto <span className="pmodal-req" aria-hidden="true">*</span></label>
                <select
                  id="ns-projeto"
                  required
                  aria-required="true"
                  className="inp"
                  value={projetoId}
                  onChange={(e) => setProjetoId(e.target.value)}
                >
                  <option value="">Escolher</option>
                  {projetosCliente.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                {projetosCliente.length === 0 && (
                  <div className="pmodal-field-hint">Nenhum projeto cadastrado. Fale com o time.</div>
                )}
              </div>
              <div className="pmodal-field">
                <label htmlFor="ns-tipo">Tipo <span className="pmodal-req" aria-hidden="true">*</span></label>
                <select
                  id="ns-tipo"
                  required
                  aria-required="true"
                  className="inp"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoTrabalho | '')}
                >
                  <option value="">Escolher</option>
                  {TIPOS_TRABALHO.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="pmodal-field">
                <label htmlFor="ns-prio">
                  Prioridade <span>opcional</span>
                </label>
                <select
                  id="ns-prio"
                  className="inp"
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value as PrioCliente | '')}
                >
                  <option value="">Escolher</option>
                  {PRIORIDADES.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>


            <div className="pmodal-field">
              <label htmlFor="ns-desc">O que você precisa? <span className="pmodal-req" aria-hidden="true">*</span></label>
              <textarea
                id="ns-desc"
                required
                aria-required="true"
                className="inp"
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onPaste={(e) => {
                  const imgs = imagensDoClipboard(e);
                  if (!imgs.length) return;
                  e.preventDefault();
                  setImagens((cur) => juntarPendentes(cur, imgs));
                }}
                placeholder="Contexto, exemplos e links ajudam o time a entender. Dá para colar prints aqui."
              />
            </div>

            <div className="pmodal-field">
              <span className="pmodal-field-label">
                Prints <span>opcional</span>
              </span>
              <div className="pmodal-imagens">
                <ImagensPendentes
                  arquivos={imagens}
                  onRemover={(i) => setImagens((cur) => cur.filter((_, j) => j !== i))}
                />
                {imagens.length < MAX_POR_MENSAGEM && (
                  <button type="button" className="pmodal-imagens-btn" onClick={() => inputImagens.current?.click()}>
                    <Icon name="paperclip" size={14} />
                    Adicionar imagem
                  </button>
                )}
                <input
                  ref={inputImagens}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).filter((f) => TIPOS_IMAGEM.test(f.type));
                    if (files.length) setImagens((cur) => juntarPendentes(cur, files));
                    e.target.value = '';
                  }}
                />
              </div>
            </div>

            <div className="pmodal-field">
              <label htmlFor="ns-valor">
                Valor esperado <span className="pmodal-req" aria-hidden="true">*</span>
              </label>
              <textarea
                id="ns-valor"
                required
                aria-required="true"
                className="inp"
                rows={2}
                value={valorEsperado}
                onChange={(e) => setValorEsperado(e.target.value)}
                placeholder="O que muda para você quando isso estiver pronto?"
              />
            </div>

            {err && <div className="pmodal-form-err">{err}</div>}
          </div>
        </div>

        <div className="pmodal-dialog-foot pmodal-form-foot">
          <span className="pmodal-req-legenda">
            <span className="pmodal-req" aria-hidden="true">*</span> campos obrigatórios
          </span>
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!podeEnviar}>
            {pending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
