import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge de classes Tailwind (padrão shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Converte string vazia/nullish em null, ou tenta number. Usado em
 *  forms de Cadastros (SLA horas/dias, orçamento, capacidade). */
export function numOrNull(v: string | number | null | undefined): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza domínio de email (lowercase, sem @, sem espaço, deve ter ponto). */
export function normalizeDominio(s: string): string {
  const v = String(s || '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
  if (!v || !v.includes('.')) return '';
  return v;
}
