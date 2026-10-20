/**
 * Executa uma consulta do Supabase sem bloquear a tela.
 *
 * O builder do Supabase JS só dispara quando é aguardado (`await` ou
 * `.then`). `void sb.from(...).insert(...)` ou a chamada solta não executam
 * nada; foi assim que histórico e avisos se perderam até out/2026.
 */
export function emSegundoPlano(q: PromiseLike<{ error: unknown }>, contexto: string): void {
  Promise.resolve(q).then(
    ({ error }) => {
      // eslint-disable-next-line no-console
      if (error) console.warn(`[${contexto}]`, error);
    },
    // eslint-disable-next-line no-console
    (e) => console.warn(`[${contexto}]`, e),
  );
}
