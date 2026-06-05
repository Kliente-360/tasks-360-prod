'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
    <div className="fixed inset-0 z-[80] flex flex-col bg-[color:var(--bg-base)] md:hidden">
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
        O <strong className="text-ink">Resumo executivo</strong> é a tela inicial no celular. Ela mostra uma visão consolidada do estado atual dos projetos e equipe — pense como um painel de controle rápido para o gestor.
      </p>

      <Section icon="bar-chart-2" title="O que aparece aqui">
        <p>Indicadores de volume e saúde das tarefas por etapa, bloqueios ativos, prazo vencido e o que está em dia — tudo em uma tela só, sem precisar navegar.</p>
        <p>Os números são calculados em tempo real a partir dos dados do backlog; qualquer mudança feita em outra aba reflete automaticamente.</p>
      </Section>

      <Section icon="hand" title="Navegar entre telas">
        <p>Deslize o dedo para a esquerda para ir ao <strong className="text-ink">Backlog</strong>, ou para a direita para voltar ao Resumo.</p>
        <Tip>O gesto funciona em qualquer ponto da tela — não precisa acertar um botão.</Tip>
      </Section>

      <Section icon="bell" title="Alertas em destaque">
        <p>Tarefas <strong className="text-ink">atrasadas</strong>, <strong className="text-ink">bloqueadas</strong> ou com <strong className="text-ink">prazo hoje</strong> ganham destaque visual para chamar atenção imediata.</p>
        <p>Toque em qualquer tarefa destacada para ver os detalhes completos.</p>
      </Section>

      <Section icon="check-circle" title="Botão Resolver">
        <p>No cartão de alerta, o botão <strong className="text-ink">Resolver</strong> marca o item como tratado para o dia — ele some dos alertas sem alterar o status real da tarefa.</p>
        <Tip>Os itens resolvidos voltam ao painel no dia seguinte se ainda não estiverem concluídos.</Tip>
      </Section>
    </>
  );
}

function BacklogHelp() {
  return (
    <>
      <p className="text-sm text-ink-soft mb-5 leading-relaxed">
        O <strong className="text-ink">Backlog</strong> lista todas as tarefas abertas atribuídas a você. Use-o para acompanhar, filtrar e atualizar o andamento do seu trabalho no celular.
      </p>

      <Section icon="search" title="Barra de pesquisa">
        <p>Digite qualquer trecho do título ou descrição da tarefa para filtrar em tempo real. A busca age enquanto você digita — não precisa confirmar.</p>
        <Tip>O campo é focado sem zoom no iOS — digitação é tranquila mesmo em telas pequenas.</Tip>
      </Section>

      <Section icon="sliders" title="Botão Filtro">
        <p>Abre um painel deslizante com os filtros disponíveis:</p>
        <ul className="list-disc list-inside space-y-1 pl-1">
          <li><strong className="text-ink">Cliente</strong> — filtra pelo cliente do projeto</li>
          <li><strong className="text-ink">Projeto</strong> — filtra pelo projeto (fica inativo sem cliente selecionado)</li>
          <li><strong className="text-ink">Status</strong> — etapa atual da tarefa</li>
          <li><strong className="text-ink">Prioridade</strong> — urgente, alta, normal, baixa</li>
          <li><strong className="text-ink">Prazo</strong> — hoje, esta semana, atrasadas</li>
        </ul>
        <p>Cada filtro também tem botões <strong className="text-ink">↑ ↓</strong> para ordenar a lista por aquela coluna.</p>
      </Section>

      <Section icon="x" title="Botão limpar (X)">
        <p>Aparece à direita da barra de busca. Quando desabilitado (cinza), nenhum filtro está ativo. Quando ativado (vermelho), mostra o número de filtros aplicados e limpa tudo com um toque — incluindo a ordem de classificação.</p>
      </Section>

      <Section icon="list" title="Lista de tarefas">
        <p>Cada linha mostra o título, cliente/projeto, prioridade e prazo. Toque em uma tarefa para abrir os detalhes completos com comentários.</p>
        <p>A lista aplica todos os filtros ativos ao mesmo tempo — busca, filtros do painel e ordenação funcionam em conjunto.</p>
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
