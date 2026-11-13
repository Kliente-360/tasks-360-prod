import { describe, expect, it } from 'vitest';
import { dataSaoPaulo, janelaDoLancamento } from './lancamento';

const agora = new Date('2026-11-12T17:30:45-03:00');

describe('janelaDoLancamento', () => {
  it('hoje termina agora (minuto cheio) e começa a duração antes', () => {
    const j = janelaDoLancamento('2026-11-12', 90, agora);
    expect(j.ok && j.endedAt.toISOString()).toBe('2026-11-12T20:30:00.000Z');
    expect(j.ok && j.startedAt.toISOString()).toBe('2026-11-12T19:00:00.000Z');
  });
  it('dia passado termina às 18h de São Paulo', () => {
    const j = janelaDoLancamento('2026-11-10', 120, agora);
    expect(j.ok && j.startedAt.toISOString()).toBe('2026-11-10T19:00:00.000Z');
    expect(j.ok && j.endedAt.toISOString()).toBe('2026-11-10T21:00:00.000Z');
  });
  it('duração longa encosta na meia-noite', () => {
    const j = janelaDoLancamento('2026-11-10', 20 * 60, agora);
    expect(j.ok && j.startedAt.toISOString()).toBe('2026-11-10T03:00:00.000Z');
    expect(j.ok && j.endedAt.toISOString()).toBe('2026-11-10T23:00:00.000Z');
  });
  it('recusa data futura, formato errado e duração fora do limite', () => {
    expect(janelaDoLancamento('2026-11-13', 60, agora).ok).toBe(false);
    expect(janelaDoLancamento('12/11/2026', 60, agora).ok).toBe(false);
    expect(janelaDoLancamento('2026-11-12', 0, agora).ok).toBe(false);
    expect(janelaDoLancamento('2026-11-12', 24 * 60 + 1, agora).ok).toBe(false);
  });
  it('dataSaoPaulo vira o dia às 21h UTC', () => {
    expect(dataSaoPaulo(new Date('2026-11-13T02:59:00Z'))).toBe('2026-11-12');
    expect(dataSaoPaulo(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13');
  });
});
