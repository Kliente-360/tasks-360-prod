import { NAV } from '@/lib/nav';

/**
 * Placeholder de tela ainda não portada. Some conforme cada onda
 * entrega a tela de verdade.
 */
export function OndaPlaceholder({ href, title }: { href: string; title: string }) {
  const item = NAV.find((n) => n.href === href);
  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="font-brand text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-3 text-sm text-muted">
        Esta tela é portada do app atual na{' '}
        <strong className="text-brand-dark">Onda {item?.onda ?? '?'}</strong> do rebuild.
      </p>
      <p className="mt-1 font-mono text-xs text-muted">
        rota pronta · conteúdo pendente
      </p>
    </div>
  );
}
