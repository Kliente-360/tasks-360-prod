/**
 * Custom events globais — strings centralizadas pra evitar typos.
 *
 * Disparados via `window.dispatchEvent(new CustomEvent(NAME))` em
 * triggers (atalhos, palette, etc) e capturados em cada tela com
 * `window.addEventListener(NAME, handler)`. Funciona como um event
 * bus minimalista — sem precisar de novo Provider/Context.
 */

/** g+l no atalho global, ou ação "Limpar filtros" no palette. */
export const CLEAR_FILTERS_EVENT = 'kliente360:clear-filters';
