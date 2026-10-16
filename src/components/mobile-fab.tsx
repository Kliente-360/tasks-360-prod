'use client';

import { useTaskModal } from '@/components/task-modal';
import { useData } from '@/lib/data-store';
import { useMarcaCliente } from '@/lib/use-marca-cliente';

/** FAB mobile — botão flutuante "+" no canto inferior direito, só em telas < md.
 *  Cliente: abre a nova solicitação do portal, na cor do cliente. */
export function MobileFab() {
  const { openNew } = useTaskModal();
  const { viewerRole } = useData();
  const marca = useMarcaCliente();
  const cliente = viewerRole === 'cliente';
  const label = cliente ? 'Nova solicitação' : 'Nova tarefa';
  return (
    <button
      type="button"
      onClick={() => (cliente ? window.dispatchEvent(new CustomEvent('portal:new-task')) : openNew())}
      className="md:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-[var(--brand)] text-white shadow-lg flex items-center justify-center text-3xl font-light leading-none hover:opacity-90 active:scale-95 transition-all select-none"
      style={{
        bottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        ...(marca ? { background: marca.cor, color: marca.texto } : {}),
      }}
      aria-label={label}
      title={label}
    >
      +
    </button>
  );
}
