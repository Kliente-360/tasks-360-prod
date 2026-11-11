'use client';

import { Icon } from '@/components/icons';
import { useTaskModal } from '@/components/task-modal';
import { useData } from '@/lib/data-store';
import { useMarcaCliente, usePodeAbrirSolicitacao } from '@/lib/use-marca-cliente';

/** FAB mobile — botão flutuante "+" no canto inferior direito, só em telas < md.
 *  Cliente: abre a nova solicitação do portal, na cor do cliente. */
export function MobileFab() {
  const { openNew } = useTaskModal();
  const { viewerRole } = useData();
  const marca = useMarcaCliente();
  const pode = usePodeAbrirSolicitacao();
  const cliente = viewerRole === 'cliente';
  if (!pode) return null;
  const label = cliente ? 'Nova solicitação' : 'Nova tarefa';
  return (
    <button
      type="button"
      onClick={() => (cliente ? window.dispatchEvent(new CustomEvent('portal:new-task')) : openNew())}
      className="md:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-[var(--green-action)] text-white shadow-lg flex items-center justify-center text-3xl font-light leading-none hover:opacity-90 active:scale-95 transition-all select-none"
      style={{
        bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        ...(marca ? { background: marca.cor, color: marca.texto } : {}),
      }}
      aria-label={label}
      title={label}
    >
      <Icon name="plus" size={26} />
    </button>
  );
}

/** FAB desktop — "+" redondo como o do mobile, alinhado à borda direita da
 *  área de conteúdo (não da janela). Cliente: nova solicitação, na cor do
 *  cliente. Time: nova tarefa, no verde da marca (substituiu o "+ Tarefa"
 *  do header em nov/2026). */
export function DesktopFab() {
  const { viewerRole } = useData();
  const { openNew } = useTaskModal();
  const marca = useMarcaCliente();
  const pode = usePodeAbrirSolicitacao();
  if (!viewerRole || !pode) return null;
  const cliente = viewerRole === 'cliente';
  const label = cliente ? 'Nova solicitação' : 'Nova tarefa';
  return (
    <button
      type="button"
      onClick={() => (cliente ? window.dispatchEvent(new CustomEvent('portal:new-task')) : openNew())}
      className="cliente-fab hidden md:inline-flex"
      style={marca ? { background: marca.cor, color: marca.texto } : undefined}
      aria-label={label}
      title={cliente ? label : `${label} (N)`}
      data-track={cliente ? 'FAB nova solicitação' : 'FAB nova tarefa'}
    >
      {/* SVG em vez do caractere "+": o glifo da fonte fica fora do centro */}
      <Icon name="plus" size={26} />
    </button>
  );
}
