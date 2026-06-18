'use client';

/**
 * 3.D · Form de nova solicitação · cliente externo abre task pelo Portal.
 *
 * Cai na Triagem do time (não direto no backlog) — espelha o gate de IA:
 * task criada com `criado_por_cliente=true`, `triada_em=null`, sem
 * `pessoa_id`, `visivel_cliente=true`, `subetapa='backlog'`.
 *
 * RLS `tasks_cliente_insert` valida tudo isso no banco.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';

type TipoTrabalho = 'bug' | 'feature' | 'discovery' | 'manutencao' | 'admin';
type PrioCliente = 'alta' | 'media' | 'baixa';

const TIPO_LABEL: Record<TipoTrabalho, string> = {
  bug: '🐛 Erro / Bug',
  feature: '✨ Melhoria / Feature',
  discovery: '🔍 Dúvida / Discovery',
  manutencao: '🔧 Manutenção',
  admin: '📋 Administrativo',
};

export function PortalNewTaskForm({
  clienteId,
  onClose,
}: {
  clienteId: string;
  onClose: () => void;
}) {
  const { projetos, upsertTask } = useData();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorEsperado, setValorEsperado] = useState('');
  const [projetoId, setProjetoId] = useState<string>('');
  const [tipoTrabalho, setTipoTrabalho] = useState<TipoTrabalho>('discovery');
  const [prioridadeSolicitada, setPrioridadeSolicitada] = useState<PrioCliente>('media');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const projetosCliente = projetos.filter((p) => p.clienteId === clienteId && !p.arquivadoEm);

  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = useCallback(() => {
    setErr(null);
    const t = titulo.trim();
    if (!t) {
      setErr('Dê um título à sua solicitação.');
      return;
    }
    if (!projetoId) {
      setErr('Escolha o projeto.');
      return;
    }
    startTransition(async () => {
      const sb = createClient();
      const nowIso = new Date().toISOString();
      const payload = {
        titulo: t,
        descricao: descricao.trim(),
        valor_esperado: valorEsperado.trim(),
        cliente_id: clienteId,
        projeto_id: projetoId,
        pessoa_id: null,
        prioridade: null,
        prioridade_solicitada_cliente: prioridadeSolicitada,
        tipo_trabalho: tipoTrabalho,
        status: 'backlog',
        subetapa: 'backlog',
        visivel_cliente: true,
        criado_por_cliente: true,
        privada: false,
        triada_em: null,
        status_em: nowIso,
        subetapa_em: nowIso,
      };
      const { data, error } = await sb.from('tasks').insert(payload).select().single();
      if (error || !data) {
        setErr(error?.message || 'Falha ao enviar solicitação. Tente novamente.');
        return;
      }
      // Adiciona optimistic ao store (cliente vai ver a task aparecer na lista)
      // Adapter resolve do row recebido.
      const { taskFromDb } = await import('@/lib/adapters');
      upsertTask(taskFromDb(data as Record<string, unknown>));
      onClose();
    });
  }, [titulo, descricao, valorEsperado, projetoId, prioridadeSolicitada, tipoTrabalho, clienteId, upsertTask, onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 px-2 py-2 md:items-center md:px-4 md:py-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg border border-line bg-bg-elev shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 md:px-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted">Nova solicitação</div>
            <div className="mt-0.5 font-brand text-lg font-semibold">Conta pra gente o que você precisa</div>
            <div className="mt-1 text-xs text-muted">
              O time vai revisar e priorizar — você recebe atualização aqui no Portal.
            </div>
          </div>
          <button className="px-2 text-2xl text-muted hover:text-ink" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 md:px-6 space-y-3">
          <div>
            <label className="lbl">Título <span className="text-danger">*</span></label>
            <input
              type="text"
              className="inp"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Resumo curto da solicitação"
              maxLength={120}
              autoFocus
            />
          </div>

          <div>
            <label className="lbl">Projeto <span className="text-danger">*</span></label>
            <select className="inp" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
              <option value="">— escolher</option>
              {projetosCliente.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            {projetosCliente.length === 0 && (
              <div className="text-[11px] text-muted mt-1">
                Sem projetos vinculados a este cliente. Peça ao time pra cadastrar.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Tipo</label>
              <select className="inp" value={tipoTrabalho} onChange={(e) => setTipoTrabalho(e.target.value as TipoTrabalho)}>
                {(Object.keys(TIPO_LABEL) as TipoTrabalho[]).map((k) => (
                  <option key={k} value={k}>{TIPO_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Urgência</label>
              <select className="inp" value={prioridadeSolicitada} onChange={(e) => setPrioridadeSolicitada(e.target.value as PrioCliente)}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </div>
          </div>

          <div>
            <label className="lbl">Descrição</label>
            <textarea
              className="inp"
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que você precisa que seja feito? Contexto · prints · links ajudam."
            />
          </div>

          <div>
            <label className="lbl">Valor esperado</label>
            <textarea
              className="inp"
              rows={2}
              value={valorEsperado}
              onChange={(e) => setValorEsperado(e.target.value)}
              placeholder="O que essa entrega vai gerar de positivo pra você ou pro time?"
            />
          </div>

          {err && <div className="text-sm text-[color:var(--danger)]">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3 md:px-6">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>cancelar</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={pending || !titulo.trim() || !projetoId}
          >
            {pending ? 'enviando…' : 'enviar solicitação'}
          </button>
        </div>
      </div>
    </div>
  );
}
