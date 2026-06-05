'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { useData } from '@/lib/data-store';
import { Icon } from '@/components/icons';

// ============ Context ============

type MobileHelpApi = { open: () => void; close: () => void };
const MobileHelpContext = createContext<MobileHelpApi | null>(null);

export function useMobileHelp(): MobileHelpApi {
  const ctx = useContext(MobileHelpContext);
  if (!ctx) throw new Error('useMobileHelp precisa de <MobileHelpProvider>');
  return ctx;
}

export function MobileHelpProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const api = useMemo<MobileHelpApi>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [],
  );
  return (
    <MobileHelpContext.Provider value={api}>
      {children}
      {isOpen && <MobileHelpModal onClose={() => setIsOpen(false)} />}
    </MobileHelpContext.Provider>
  );
}

// ============ Modal ============

function MobileHelpModal({ onClose }: { onClose: () => void }) {
  const { viewerRole } = useData();
  const isAdmin = viewerRole === 'admin';
  const [tab, setTab] = useState<'resumo' | 'backlog'>(isAdmin ? 'resumo' : 'backlog');

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[color:var(--bg)] md:hidden">
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-line bg-[color:var(--bg-elev)]"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))' }}
      >
        <span className="font-brand font-semibold text-base text-ink">Como usar no celular</span>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={onClose}
          aria-label="Fechar"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Tabs — só mostra seletor se admin (tem as duas abas) */}
      {isAdmin && (
        <div className="shrink-0 flex border-b border-line bg-[color:var(--bg-elev)]">
          <button
            type="button"
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'resumo'
                ? 'text-[color:var(--green)] border-b-2 border-[color:var(--green)]'
                : 'text-muted'
            }`}
            onClick={() => setTab('resumo')}
          >
            Resumo executivo
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'backlog'
                ? 'text-[color:var(--green)] border-b-2 border-[color:var(--green)]'
                : 'text-muted'
            }`}
            onClick={() => setTab('backlog')}
          >
            Backlog
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        {tab === 'resumo' && isAdmin && <ResumoHelp />}
        {tab === 'backlog' && <BacklogHelp />}
      </div>
    </div>
  );
}

// ============ Sections ============

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={16} className="text-[color:var(--green)] shrink-0" />
        <h2 className="font-semibold text-sm text-ink">{title}</h2>
      </div>
      <div className="text-sm text-ink-soft leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 bg-[color:var(--brand-tint)] rounded-md px-3 py-2 text-xs text-[color:var(--brand-dark)]">
      <Icon name="info" size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

function ResumoHelp() {
  return (
    <>
      <p className="text-sm text-ink-soft mb-5 leading-relaxed">
        O <strong className="text-ink">Resumo executivo</strong> é a tela inicial do app no celular. Exclusiva para gestores — mostra a saúde da operação em tempo real sem precisar navegar por outras telas.
      </p>

      <Section icon="hand" title="Navegar entre telas">
        <p>Deslize o dedo para a <strong className="text-ink">esquerda</strong> para ir ao Backlog, ou para a <strong className="text-ink">direita</strong> para voltar ao Resumo.</p>
        <Tip>O gesto funciona em qualquer ponto da tela — não precisa acertar um botão.</Tip>
      </Section>

      <Section icon="bell" title="Alertas">
        <p>Alertas gerados automaticamente sobre situações que precisam de atenção: tarefas sem responsável, projetos parados, clientes sem movimentação recente e outros.</p>
        <p>Cada alerta tem severidade <strong className="text-ink">crítica</strong> (vermelho) ou <strong className="text-ink">atenção</strong> (amarelo). Quando tudo está bem, aparece <em>tudo certo</em> em verde.</p>
      </Section>

      <Section icon="bar-chart-2" title="Velocidade da operação">
        <p>Quatro indicadores de throughput e previsibilidade dos últimos 30 dias:</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-ink">Throughput W-1</strong> — tasks concluídas na semana anterior (meta ≥ 25)</li>
          <li><strong className="text-ink">Throughput W-0</strong> — tasks concluídas nesta semana + projeção</li>
          <li><strong className="text-ink">Ciclo médio</strong> — dias médios do início à conclusão</li>
          <li><strong className="text-ink">Previsibilidade</strong> — % de tarefas entregues dentro do prazo</li>
        </ul>
      </Section>

      <Section icon="grid" title="Capacidade do time">
        <p>Heatmap por pessoa para as próximas 4 semanas. Células vermelhas indicam <strong className="text-ink">sobrecarga</strong>, amarelas indicam <strong className="text-ink">pressão</strong>, verdes indicam <strong className="text-ink">ok</strong>.</p>
        <Tip>O percentual exibido é a ocupação estimada com base nas tarefas abertas e esforço cadastrado.</Tip>
      </Section>

      <Section icon="calendar" title="Calendário de entregas">
        <p>Grade semanal (Dom a Sáb) mostrando quantas tarefas têm prazo em cada dia — semana anterior, atual e as próximas 4.</p>
        <p>Dias com muitas entregas ou com prazo vencido aparecem em vermelho; dias com poucas entregas em amarelo.</p>
      </Section>

      <Section icon="alert" title="P0 e P1 atrasadas">
        <p>Lista de tarefas de alta prioridade com prazo vencido e ainda abertas, ordenadas pelo maior atraso. Toque em qualquer uma para abrir os detalhes.</p>
        <Tip>P0 = urgente, P1 = alta. P2 e P3 não entram aqui — fique de olho nas críticas.</Tip>
      </Section>
    </>
  );
}

function BacklogHelp() {
  return (
    <>
      <p className="text-sm text-ink-soft mb-5 leading-relaxed">
        O <strong className="text-ink">Backlog</strong> mostra as tarefas abertas atribuídas a você. Use para acompanhar o que está pendente, filtrar por contexto e abrir uma tarefa para ver detalhes ou adicionar comentários.
      </p>

      <Section icon="search" title="Busca">
        <p>Digite qualquer parte do título da tarefa para filtrar em tempo real — a lista atualiza enquanto você digita, sem precisar confirmar.</p>
        <Tip>Em iOS o campo não provoca zoom ao focar — a leitura continua tranquila no celular.</Tip>
      </Section>

      <Section icon="sliders" title="Botão Filtro">
        <p>Abre um painel deslizante com os filtros disponíveis:</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-ink">Cliente</strong> — filtra pelo cliente do projeto</li>
          <li><strong className="text-ink">Projeto</strong> — disponível após selecionar um cliente</li>
          <li><strong className="text-ink">Status</strong> — etapa atual da tarefa no fluxo</li>
          <li><strong className="text-ink">Prioridade</strong> — P0 (urgente) até P3 (baixa)</li>
          <li><strong className="text-ink">Prazo</strong> — hoje, esta semana ou atrasadas</li>
        </ul>
        <p>Cada filtro tem botões <strong className="text-ink">↑ ↓</strong> para ordenar a lista por aquele campo.</p>
      </Section>

      <Section icon="x" title="Botão limpar">
        <p>Fica à direita da busca. Cinza e desativado quando não há filtros; vermelho com o número de filtros ativos quando há algo aplicado. Um toque limpa tudo — busca, filtros e ordenação.</p>
      </Section>

      <Section icon="list" title="Lista de tarefas">
        <p>Toque em qualquer tarefa para abrir os detalhes com título, descrição, histórico e comentários. Todos os filtros e a busca atuam juntos ao mesmo tempo.</p>
      </Section>
    </>
  );
}

// ============ Menu item ============

export function MobileHelpMenuItem({ onClick }: { onClick?: () => void }) {
  const { open } = useMobileHelp();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        open();
      }}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-ink hover:bg-[color:var(--brand-tint)] transition-colors"
    >
      <span className="whitespace-nowrap inline-flex items-center gap-2">
        <Icon name="help" size={14} />
        Como usar no celular
      </span>
    </button>
  );
}
