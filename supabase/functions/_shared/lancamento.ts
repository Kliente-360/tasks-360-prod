/**
 * Janela de um lançamento manual de horas (data + duração), igual ao
 * formulário do app (LancamentoForm em src/components/timer-button.tsx):
 *   - hoje: termina agora e começa `minutos` antes
 *   - dia passado: termina às 18:00 e começa `minutos` antes
 *   - nos dois casos, se começar antes da meia-noite, encosta no início do dia
 * Fuso fixo de São Paulo (UTC-3, sem horário de verão desde 2019).
 *
 * Sem Deno nem Supabase aqui: importado pela edge e pelos testes (Vitest).
 */

const OFFSET = '-03:00';
const MIN_MS = 60_000;

/** YYYY-MM-DD de um instante no fuso de São Paulo */
export function dataSaoPaulo(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export type Janela = { ok: true; startedAt: Date; endedAt: Date } | { ok: false; erro: string };

export function janelaDoLancamento(data: string, minutos: number, agora: Date): Janela {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00${OFFSET}`))) {
    return { ok: false, erro: 'data deve estar no formato YYYY-MM-DD' };
  }
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 24 * 60) {
    return { ok: false, erro: 'a duração deve ficar entre 1 minuto e 24 horas' };
  }
  const hoje = dataSaoPaulo(agora);
  if (data > hoje) return { ok: false, erro: 'não dá para lançar horas em data futura' };
  const durMs = Math.round(minutos) * MIN_MS;
  const inicioDoDia = new Date(`${data}T00:00:00${OFFSET}`);
  // Igual ao app: minutos exatos (o banco usa isso para reconhecer lançamento manual)
  const fim = data === hoje ? new Date(Math.floor(agora.getTime() / MIN_MS) * MIN_MS) : new Date(`${data}T18:00:00${OFFSET}`);
  let startedAt = new Date(fim.getTime() - durMs);
  let endedAt = fim;
  if (startedAt < inicioDoDia) {
    startedAt = inicioDoDia;
    endedAt = new Date(inicioDoDia.getTime() + durMs);
  }
  return { ok: true, startedAt, endedAt };
}
