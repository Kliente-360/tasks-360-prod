'use client';

/**
 * Adoção · o que é usado no app e o que não é (só admin).
 * Dados de `usage_events` agregados no servidor (app_adocao e
 * app_adocao_detalhes). Período: 7, 30 ou 90 dias.
 */

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useData } from '@/lib/data-store';
import { PageHeader } from '@/components/page-header';
import { NAV } from '@/lib/nav';

type Linha = Record<string, string | number | null>;
interface Resumo {
  desde: string;
  resumo: { eventos: number; usuarios: number; sessoes: number; usuarios_internos: number; usuarios_clientes: number; eventos_mobile: number };
  por_evento: Linha[];
  por_tela: Linha[];
  por_clique: Linha[];
  por_pessoa: Linha[];
  por_dia: Linha[];
}
interface Detalhes {
  por_origem: Linha[];
  comentarios: Record<string, number>;
  campos: Linha[];
  abas_modal: Linha[];
}

/** Catálogo de eventos com nome legível. Os que não aparecem no período
 *  entram em "Nunca usado". */
const EVENTOS: Record<string, string> = {
  session_start: 'Sessão iniciada',
  page_view: 'Troca de tela',
  click: 'Clique',
  task_open: 'Abrir tarefa',
  task_new_open: 'Abrir modal de nova tarefa',
  task_create: 'Criar tarefa',
  task_update: 'Atualizar campos de tarefa',
  task_close: 'Fechar tarefa (tempo aberta)',
  filtro: 'Usar filtro',
  anexo_imagem: 'Enviar imagem (evidência)',
  bulk_update: 'Atualização em massa (Backlog)',
  bulk_arquivar: 'Arquivar em massa (Backlog)',
  bulk_excluir: 'Excluir em massa (Backlog)',
  comment_post: 'Comentar',
  comment_visibilidade: 'Mudar visibilidade de comentário',
  modal_aba: 'Trocar aba no modal da tarefa',
  timer_start: 'Iniciar cronômetro',
  timer_stop: 'Parar cronômetro',
  timesheet_lancamento: 'Lançar horas manualmente',
  busca: 'Buscar',
  help_open: 'Abrir manual',
  onboarding_open: 'Abrir onboarding',
  export: 'Exportar',
  notif_open: 'Abrir notificação',
  command_palette_open: 'Abrir paleta de comandos',
  radar_toggle: 'Marcar/desmarcar Radar do CEO',
  prioridade_pedido_resposta: 'Responder pedido de prioridade',
  triagem_aceitar: 'Triagem · aceitar',
  triagem_rejeitar: 'Triagem · rejeitar',
  triagem_salvar: 'Triagem · salvar',
  solicitacao_abrir: 'Portal · abrir nova solicitação',
  solicitacao_criada: 'Portal · enviar solicitação',
  portal_aprovar: 'Portal · aprovar entrega',
  portal_ajuste: 'Portal · pedir ajuste',
  portal_responder: 'Portal · responder pendência',
  portal_prioridade_abrir: 'Portal · abrir pedido de prioridade',
  portal_prioridade: 'Portal · enviar pedido de prioridade',
};

const TELAS: Record<string, string> = Object.fromEntries([
  ...NAV.map((n) => [n.href, n.label]),
  ['/adocao', 'Adoção'],
]);

const PERIODOS = [7, 30, 90] as const;

const num = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const quando = (iso: unknown) =>
  iso ? new Date(String(iso)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const papel = (r: unknown) => (r === 'cliente' ? 'Cliente' : r === 'admin' ? 'Admin' : r === 'interno' ? 'Interno' : '—');

export function AdocaoClient() {
  const { viewerRole, pessoas } = useData();
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [dados, setDados] = useState<Resumo | null>(null);
  const [det, setDet] = useState<Detalhes | null>(null);
  const [erro, setErro] = useState('');
  const [filtroClique, setFiltroClique] = useState('');

  useEffect(() => {
    if (viewerRole !== 'admin') return;
    let cancelado = false;
    setDados(null);
    setDet(null);
    setErro('');
    const sb = createClient();
    Promise.all([sb.rpc('app_adocao', { p_dias: dias }), sb.rpc('app_adocao_detalhes', { p_dias: dias })]).then(
      ([a, b]) => {
        if (cancelado) return;
        if (a.error || b.error) {
          setErro((a.error ?? b.error)!.message);
          return;
        }
        setDados(a.data as Resumo);
        setDet(b.data as Detalhes);
      },
    );
    return () => {
      cancelado = true;
    };
  }, [dias, viewerRole]);

  const usados = useMemo(() => new Set((dados?.por_evento ?? []).map((e) => String(e.evento))), [dados]);
  const nuncaUsados = Object.entries(EVENTOS).filter(([k]) => !usados.has(k));
  const telasNaoVistas = Object.entries(TELAS).filter(
    ([rota]) => dados && !dados.por_tela.some((t) => t.rota === rota),
  );
  const pessoasSemUso = useMemo(() => {
    const ativos = new Set((dados?.por_pessoa ?? []).map((p) => p.pessoa_id));
    return pessoas.filter((p) => p.invited_at && !ativos.has(p.id));
  }, [dados, pessoas]);
  const cliques = (dados?.por_clique ?? []).filter((c) =>
    `${c.alvo} ${c.rota}`.toLowerCase().includes(filtroClique.toLowerCase()),
  );
  const maxDia = Math.max(1, ...(dados?.por_dia ?? []).map((d) => num(d.eventos)));

  if (viewerRole && viewerRole !== 'admin') {
    return <div className="card p-6 text-sm text-muted">Esta tela é só para admin.</div>;
  }

  return (
    <div className="space-y-4 md:space-y-5 adocao">
      <PageHeader
        title="Adoção"
        right={
          <div className="view-toggle" role="tablist" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p} type="button" className={dias === p ? 'active' : ''} onClick={() => setDias(p)}>
                {p} dias
              </button>
            ))}
          </div>
        }
      />

      {erro && <div className="card p-4 text-sm text-[color:var(--danger)]">Erro ao carregar: {erro}</div>}
      {!dados && !erro && <div className="text-sm text-muted">Carregando…</div>}

      {dados && det && (
        <>
          {dados.resumo.eventos === 0 && (
            <div className="card p-4 text-sm text-ink-soft">
              Ainda não há eventos no período. A coleta começou nesta versão; os dados aparecem conforme o time e os clientes usam o app.
            </div>
          )}

          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Usuários ativos" valor={dados.resumo.usuarios} legenda={`${dados.resumo.usuarios_internos} do time · ${dados.resumo.usuarios_clientes} clientes`} />
            <Kpi label="Sessões" valor={dados.resumo.sessoes} />
            <Kpi label="Eventos" valor={dados.resumo.eventos} />
            <Kpi label="Uso no celular" valor={pct(dados.resumo.eventos_mobile, dados.resumo.eventos)} legenda="dos eventos" />
            <Kpi label="Sem uso no período" valor={pessoasSemUso.length} legenda="pessoas com acesso" />
          </div>

          {/* Por dia */}
          {dados.por_dia.length > 0 && (
            <Secao titulo="Uso por dia">
              <div className="adocao-dias">
                {dados.por_dia.map((d) => (
                  <div key={String(d.dia)} className="adocao-dia" title={`${d.dia}: ${d.eventos} eventos · ${d.usuarios} usuários`}>
                    <div className="adocao-dia-barra" style={{ height: `${(num(d.eventos) / maxDia) * 100}%` }} />
                    <span>{String(d.dia).slice(8, 10)}</span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Funcionalidades */}
            <Secao titulo="Funcionalidades" sub="o que foi usado no período">
              <Tabela
                cab={['Funcionalidade', 'Vezes', 'Pessoas', 'Clientes', 'Celular', 'Último uso']}
                linhas={dados.por_evento.map((e) => [
                  EVENTOS[String(e.evento)] ?? String(e.evento),
                  num(e.total),
                  num(e.usuarios),
                  num(e.total_cliente),
                  pct(num(e.total_mobile), num(e.total)),
                  quando(e.ultimo),
                ])}
              />
            </Secao>

            {/* Nunca usados */}
            <Secao titulo="Nunca usado no período" sub="funcionalidades e telas sem nenhum uso">
              {nuncaUsados.length === 0 && telasNaoVistas.length === 0 ? (
                <div className="text-sm text-muted">Tudo foi usado pelo menos uma vez.</div>
              ) : (
                <ul className="adocao-lista">
                  {nuncaUsados.map(([k, v]) => (
                    <li key={k}>{v}</li>
                  ))}
                  {telasNaoVistas.map(([rota, v]) => (
                    <li key={rota}>Tela · {v}</li>
                  ))}
                </ul>
              )}
            </Secao>
          </div>

          {/* Telas */}
          <Secao titulo="Navegação por tela">
            <Tabela
              cab={['Tela', 'Visitas', 'Pessoas', 'Por clientes', 'Celular']}
              linhas={dados.por_tela.map((t) => [
                TELAS[String(t.rota)] ?? String(t.rota),
                num(t.views),
                num(t.usuarios),
                num(t.views_cliente),
                pct(num(t.views_mobile), num(t.views)),
              ])}
            />
          </Secao>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Secao titulo="Por onde" sub="mesma ação, origem diferente">
              <Tabela
                cab={['Ação', 'Origem', 'Vezes', 'Pessoas']}
                linhas={det.por_origem.map((o) => [
                  EVENTOS[String(o.evento)] ?? String(o.evento),
                  String(o.origem),
                  num(o.total),
                  num(o.usuarios),
                ])}
              />
            </Secao>
            <Secao titulo="Comentários">
              <Tabela
                cab={['Tipo', 'Quantidade']}
                linhas={[
                  ['Total de comentários', det.comentarios.total ?? 0],
                  ['Visíveis ao cliente (externos)', det.comentarios.externos ?? 0],
                  ['Internos', det.comentarios.internos ?? 0],
                  ['Respostas a uma mensagem', det.comentarios.respostas ?? 0],
                  ['Escritos por clientes', det.comentarios.do_cliente ?? 0],
                  ['Internos tornados externos depois', det.comentarios.tornados_externos ?? 0],
                ]}
              />
            </Secao>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Secao titulo="Campos atualizados" sub="por onde cada campo é editado">
              <Tabela
                cab={['Campo', 'Onde', 'Vezes', 'Pessoas']}
                linhas={det.campos.map((c) => [String(c.campo), String(c.origem ?? 'massa'), num(c.total), num(c.usuarios)])}
              />
            </Secao>
            <Secao titulo="Abas do modal da tarefa">
              <Tabela
                cab={['Aba', 'Área', 'Aberturas', 'Pessoas']}
                linhas={det.abas_modal.map((a) => [String(a.aba), a.tipo === 'painel' ? 'Painel lateral' : 'Formulário', num(a.total), num(a.usuarios)])}
              />
            </Secao>
          </div>

          {/* Pessoas */}
          <Secao titulo="Pessoas">
            <Tabela
              cab={['Pessoa', 'Papel', 'Cliente', 'Eventos', 'Sessões', 'Dias ativos', 'Celular', 'Último uso']}
              linhas={[
                ...dados.por_pessoa.map((p) => [
                  String(p.pessoa_nome),
                  papel(p.role),
                  String(p.cliente_nome ?? '—'),
                  num(p.eventos),
                  num(p.sessoes),
                  num(p.dias_ativos),
                  pct(num(p.eventos_mobile), num(p.eventos)),
                  quando(p.ultimo),
                ]),
                ...pessoasSemUso.map((p) => [p.nome, papel(p.role), '—', 0, 0, 0, '—', 'sem uso']),
              ]}
            />
          </Secao>

          {/* Cliques */}
          <Secao
            titulo="Cliques mais frequentes"
            sub="botões, links, abas e caixas de seleção"
            direita={
              <label className="search" style={{ width: 200 }}>
                <input
                  type="text"
                  value={filtroClique}
                  onChange={(e) => setFiltroClique(e.target.value)}
                  placeholder="Filtrar"
                  aria-label="Filtrar cliques"
                />
              </label>
            }
          >
            <Tabela
              cab={['Elemento', 'Tela', 'Cliques', 'Pessoas']}
              linhas={cliques.map((c) => [String(c.alvo), TELAS[String(c.rota)] ?? String(c.rota), num(c.total), num(c.usuarios)])}
            />
          </Secao>
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor, legenda }: { label: string; valor: number | string; legenda?: string }) {
  return (
    <div className="portal-kpi">
      <div className="portal-kpi-label">{label}</div>
      <div className="portal-kpi-value">{valor}</div>
      {legenda && <div className="text-[11px] text-muted">{legenda}</div>}
    </div>
  );
}

function Secao({
  titulo,
  sub,
  direita,
  children,
}: {
  titulo: string;
  sub?: string;
  direita?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink m-0">{titulo}</h2>
          {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
        </div>
        {direita}
      </div>
      <div className="p-0">{children}</div>
    </section>
  );
}

function Tabela({ cab, linhas }: { cab: string[]; linhas: (string | number)[][] }) {
  if (linhas.length === 0) return <div className="px-4 py-5 text-sm text-muted">Sem dados no período.</div>;
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="adocao-tbl">
        <thead>
          <tr>
            {cab.map((c, i) => (
              <th key={c} className={i > 0 && typeof linhas[0][i] === 'number' ? 'num' : ''}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, r) => (
            <tr key={r}>
              {l.map((v, i) => (
                <td key={i} className={typeof v === 'number' ? 'num' : ''}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
