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

import { useCallback, useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { useToastSafe } from '@/components/toast';
import { Icon } from '@/components/icons';
import { TIPOS_TRABALHO } from '@/lib/task-constants';
import { taskFromDb } from '@/lib/adapters';

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
  const { projetos, clientes, upsertTask } = useData();
  const toast = useToastSafe();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorEsperado, setValorEsperado] = useState('');
  const [projetoId, setProjetoId] = useState('');
  const [tipo, setTipo] = useState<TipoTrabalho | ''>('');
  const [prioridade, setPrioridade] = useState<PrioCliente | ''>('');
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
      track('solicitacao_criada', { task_id: String((data as { id: string }).id), props: { tipo, prioridade: prioridade || null } });
      toast.success('Solicitação enviada.');
      onClose();
    });
  }, [podeEnviar, titulo, descricao, valorEsperado, projetoId, prioridade, tipo, clienteId, upsertTask, toast, onClose]);

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
              <label htmlFor="ns-titulo">Título</label>
              <input
                id="ns-titulo"
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
                <label htmlFor="ns-projeto">Projeto</label>
                <select
                  id="ns-projeto"
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
                <label htmlFor="ns-tipo">Tipo</label>
                <select
                  id="ns-tipo"
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
              <label htmlFor="ns-desc">O que você precisa?</label>
              <textarea
                id="ns-desc"
                className="inp"
                rows={4}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Contexto, exemplos e links ajudam o time a entender."
              />
            </div>

            <div className="pmodal-field">
              <label htmlFor="ns-valor">
                Valor esperado
              </label>
              <textarea
                id="ns-valor"
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
