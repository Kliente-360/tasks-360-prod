/**
 * Pequenos helpers de formatação usados em mais de um componente.
 * Portados de lib/views/anexos.js + lib/helpers.js (escapeHtml).
 */

export function fmtBytes(n: number | null | undefined): string {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

/** Formata ISO timestamp como 'DD/MM/YYYY HH:MM'. */
export function fmtPostedEm(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Renderiza body de comment plain como HTML seguro.
 * Strip de tags + escape + realça @firstname que bate com pessoa interna.
 * NÃO trata HTML rich do Salesforce — comentários SF mostram texto puro
 * (suficiente pra Onda 0).
 */
export function renderCommentBody(body: string, internalFirstNames: Set<string>): string {
  const escaped = escapeHtml(body);
  return escaped
    .replace(/@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)/g, (m, name: string) =>
      internalFirstNames.has(name) ? `<span class="mention">@${name}</span>` : m,
    )
    .replace(/\n/g, '<br>');
}
