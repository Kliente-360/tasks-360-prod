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

/** Formata data ISO (YYYY-MM-DD ou timestamp) como 'DD/MM/YYYY'. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = String(iso);
  // YYYY-MM-DD → DD/MM/YYYY direto (sem timezone)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
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
 * Renderiza body de comment como HTML seguro.
 * Suporta comentários externos (Salesforce) com HTML rico:
 *  1. Extrai links <a href> para exibir ao final (pula uma linha)
 *  2. Converte <br>/<p> em newlines
 *  3. Strip todas as tags restantes (mantém texto puro)
 *  4. Realça @firstname que bate com pessoa interna
 *
 * Para comentários internos (plain text) os passos 1-3 são no-ops.
 */
export function renderCommentBody(body: string, internalFirstNames: Set<string>): string {
  // 1. Extrair links antes de qualquer limpeza
  const links: { href: string; text: string }[] = [];
  const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(body)) !== null) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (href && text) links.push({ href, text });
  }

  // 2. Converter <br> e <p> em newlines, depois strip todas as tags
  const stripped = body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')   // strip todas as tags restantes
    .replace(/\n{3,}/g, '\n\n') // máx 2 newlines consecutivos
    .trim();

  // 3. Escape + mentions + newlines → <br>
  const escaped = escapeHtml(stripped);
  let result = escaped
    .replace(/@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*)/g, (match, name: string) =>
      internalFirstNames.has(name) ? `<span class="mention">@${name}</span>` : match,
    )
    .replace(/\n/g, '<br>');

  // 4. Append links ao final, cada um em sua linha
  if (links.length > 0) {
    const linkHtml = links
      .map(
        (l) =>
          `<a href="${escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.text)}</a>`,
      )
      .join('<br>');
    result += `<br><br>${linkHtml}`;
  }

  return result;
}
