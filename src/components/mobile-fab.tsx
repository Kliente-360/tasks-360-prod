'use client';

import { useTaskModal } from '@/components/task-modal';

/** FAB mobile — botão flutuante "+" no canto inferior direito, só em telas < md. */
export function MobileFab() {
  const { openNew } = useTaskModal();
  return (
    <button
      type="button"
      onClick={openNew}
      className="md:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-[var(--brand)] text-white shadow-lg flex items-center justify-center text-3xl font-light leading-none hover:opacity-90 active:scale-95 transition-all select-none"
      /* Posicionado acima da .m-tabbar (~70px de altura): 70 + 16 gap + safe-area. */
      style={{ bottom: 'calc(86px + env(safe-area-inset-bottom, 0px))' }}
      aria-label="Nova tarefa"
      title="Nova tarefa"
    >
      +
    </button>
  );
}
