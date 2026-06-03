/**
 * Smoke tests — Onda 0 · 4.J
 *
 * Cobre os helpers puros portados de lib/helpers.js. Mesma lógica que o
 * tests/index.html do Alpine validava (regra de carga / triagem / atraso).
 *
 * Tudo determinístico: passamos `today` explícito onde aplicável, e usamos
 * vi.useFakeTimers pra fixar `Date.now()` em testes de aging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TaskStatus } from './types';
import {
  effEsforco,
  effTamanho,
  atrasada,
  diasAtraso,
  agingLevel,
  triageFailures,
  needsTriage,
  fmtDate,
  fmtDateShort,
  normalizeTag,
  matchesPrazoFilter,
  todayIso,
} from './task-utils';

// ─── effEsforco / effTamanho ──────────────────────────────

describe('effEsforco', () => {
  it('retorna o valor declarado quando > 0', () => {
    expect(effEsforco({ esforco: 8 })).toBe(8);
    expect(effEsforco({ esforco: 0.5 })).toBe(0.5);
  });
  it('usa fallback de 4h quando esforco é 0 / null / undefined', () => {
    expect(effEsforco({ esforco: 0 })).toBe(4);
    expect(effEsforco({ esforco: null as unknown as number })).toBe(4);
  });
});

describe('effTamanho', () => {
  it.each([
    [1, 'mini'],
    [2, 'small'],
    [7.9, 'small'],
    [8, 'medio'],
    [23, 'medio'],
    [24, 'grande'],
    [79, 'grande'],
    [80, 'mini_projeto'],
    [200, 'mini_projeto'],
  ])('esforco=%s → %s', (esforco, expected) => {
    expect(effTamanho({ esforco })).toBe(expected);
  });
  it('esforco=0 cai pro fallback 4h → small', () => {
    expect(effTamanho({ esforco: 0 })).toBe('small');
  });
});

// ─── atrasada / diasAtraso ──────────────────────────────────────────────

describe('atrasada', () => {
  it('true quando prazo < today e não concluída', () => {
    expect(atrasada({ prazo: '2026-05-19', status: 'andamento' }, '2026-05-21')).toBe(true);
  });
  it('false quando prazo == today', () => {
    expect(atrasada({ prazo: '2026-05-21', status: 'andamento' }, '2026-05-21')).toBe(false);
  });
  it('false quando prazo > today', () => {
    expect(atrasada({ prazo: '2026-05-25', status: 'andamento' }, '2026-05-21')).toBe(false);
  });
  it('false quando task concluída, mesmo com prazo passado', () => {
    expect(atrasada({ prazo: '2025-01-01', status: 'concluido' }, '2026-05-21')).toBe(false);
  });
  it('false quando sem prazo', () => {
    expect(atrasada({ prazo: '', status: 'andamento' }, '2026-05-21')).toBe(false);
  });
});

describe('diasAtraso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('positivo quando prazo passou', () => {
    expect(diasAtraso({ prazo: '2026-05-18' })).toBe(3);
  });
  it('zero no dia do prazo', () => {
    expect(diasAtraso({ prazo: '2026-05-21' })).toBe(0);
  });
  it('negativo quando ainda no prazo', () => {
    expect(diasAtraso({ prazo: '2026-05-25' })).toBe(-4);
  });
  it('zero sem prazo', () => {
    expect(diasAtraso({ prazo: '' })).toBe(0);
  });
});

// ─── agingLevel ─────────────────────────────────────────────────────────

describe('agingLevel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  const daysAgo = (n: number) => Date.now() - n * 86400000;

  it('andamento: 7d=warn, 14d=stale', () => {
    expect(agingLevel({ status: 'andamento', statusEm: daysAgo(0) })).toBe('fresh');
    expect(agingLevel({ status: 'andamento', statusEm: daysAgo(7) })).toBe('warn');
    expect(agingLevel({ status: 'andamento', statusEm: daysAgo(14) })).toBe('stale');
  });
  it('bloqueado: 3d=warn, 7d=stale (mais agressivo)', () => {
    expect(agingLevel({ status: 'bloqueado', statusEm: daysAgo(2) })).toBe('fresh');
    expect(agingLevel({ status: 'bloqueado', statusEm: daysAgo(3) })).toBe('warn');
    expect(agingLevel({ status: 'bloqueado', statusEm: daysAgo(7) })).toBe('stale');
  });
  it('concluído = sempre fresh', () => {
    expect(agingLevel({ status: 'concluido', statusEm: daysAgo(365) })).toBe('fresh');
  });
});

// ─── triageFailures / needsTriage ───────────────────────────────────────

describe('triageFailures', () => {
  const base = {
    status: 'andamento' as TaskStatus,
    clienteId: 'c1',
    projetoId: 'pr1',
    pessoaId: 'p1',
    prazo: '2026-06-01',
    esforco: 8,
  };

  it('vazio quando tudo preenchido', () => {
    expect(triageFailures(base)).toEqual([]);
  });
  it('vazio sempre pra task concluída', () => {
    expect(triageFailures({ ...base, status: 'concluido', pessoaId: '', clienteId: '' })).toEqual([]);
  });
  it('cobra os 5 campos críticos (ordem fixa)', () => {
    const out = triageFailures({ status: 'andamento', clienteId: '', projetoId: '', pessoaId: '', prazo: '', esforco: 0 });
    expect(out).toEqual(['sem cliente', 'sem projeto', 'sem responsável', 'sem prazo', 'sem esforço']);
  });
  it('cobra prazo independente do estágio', () => {
    expect(triageFailures({ ...base, prazo: '' })).toEqual(['sem prazo']);
  });
  it('cobra esforço independente do estágio', () => {
    expect(triageFailures({ ...base, esforco: 0 })).toEqual(['sem esforço']);
  });
  it('cobra projeto', () => {
    expect(triageFailures({ ...base, projetoId: '' })).toEqual(['sem projeto']);
  });
});

describe('needsTriage', () => {
  it('true se há ao menos uma falha', () => {
    expect(needsTriage({ status: 'andamento', pessoaId: '', clienteId: 'c', projetoId: 'pr', prazo: '2026-06-01', esforco: 8 })).toBe(true);
  });
  it('false quando triada', () => {
    expect(needsTriage({ status: 'andamento', pessoaId: 'p', clienteId: 'c', projetoId: 'pr', prazo: '2026-06-01', esforco: 8 })).toBe(false);
  });
});

// ─── fmtDate / normalizeTag ─────────────────────────────────────────────

describe('fmtDate / fmtDateShort', () => {
  it('formata DD/MM/YYYY e DD/MM', () => {
    expect(fmtDate('2026-05-21')).toBe('21/05/2026');
    expect(fmtDateShort('2026-05-21')).toBe('21/05');
  });
  it('— pra null / undefined', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDateShort(undefined)).toBe('—');
  });
});

describe('normalizeTag', () => {
  it('slug lowercase, espaços viram hífen, trim, max 24 chars', () => {
    expect(normalizeTag('  Migração  Onda  0  ')).toBe('migração-onda-0');
    expect(normalizeTag('UI/UX')).toBe('ui/ux');
    const long = 'a'.repeat(40);
    expect(normalizeTag(long).length).toBe(24);
  });
  it('lida com null / undefined', () => {
    expect(normalizeTag(null as unknown as string)).toBe('');
  });
});

// ─── matchesPrazoFilter ─────────────────────────────────────────────────

describe('matchesPrazoFilter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Quinta-feira, 21 de maio de 2026.
    vi.setSystemTime(new Date('2026-05-21T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  const t = (prazo: string, status: TaskStatus = 'andamento') => ({ prazo, status });

  it('vazio passa tudo', () => {
    expect(matchesPrazoFilter(t('2099-01-01'), '')).toBe(true);
    expect(matchesPrazoFilter(t(''), '')).toBe(true);
  });
  it('atrasadas: prazo < hoje e não concluído', () => {
    expect(matchesPrazoFilter(t('2026-05-19'), 'atrasadas')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-21'), 'atrasadas')).toBe(false);
    expect(matchesPrazoFilter(t('2026-05-19', 'concluido'), 'atrasadas')).toBe(false);
  });
  it('semana: segunda a domingo da semana ISO atual (2026-05-18..24)', () => {
    expect(todayIso()).toBe('2026-05-21'); // sanity check
    expect(matchesPrazoFilter(t('2026-05-18'), 'semana')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-24'), 'semana')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-17'), 'semana')).toBe(false);
    expect(matchesPrazoFilter(t('2026-05-25'), 'semana')).toBe(false);
  });
  it('d7: hoje + 7 dias', () => {
    expect(matchesPrazoFilter(t('2026-05-21'), 'd7')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-28'), 'd7')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-29'), 'd7')).toBe(false);
    expect(matchesPrazoFilter(t('2026-05-20'), 'd7')).toBe(false); // anteriores não entram
  });
  it('mes: primeiro a último dia do mês atual', () => {
    expect(matchesPrazoFilter(t('2026-05-01'), 'mes')).toBe(true);
    expect(matchesPrazoFilter(t('2026-05-31'), 'mes')).toBe(true);
    expect(matchesPrazoFilter(t('2026-04-30'), 'mes')).toBe(false);
    expect(matchesPrazoFilter(t('2026-06-01'), 'mes')).toBe(false);
  });
  it('task sem prazo nunca passa em modo ativo', () => {
    expect(matchesPrazoFilter(t(''), 'semana')).toBe(false);
    expect(matchesPrazoFilter(t(''), 'd7')).toBe(false);
  });
});
