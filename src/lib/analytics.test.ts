import { describe, it, expect } from 'vitest';
import {
  computeSLABreach,
  computeSkillMismatches,
  computeSenioridadeAlerts,
  computeBottlenecks,
  computeChurnRisk,
  computeCapacidade,
} from './analytics';
import type { Task, Pessoa, Cliente } from './types';

// ─── fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-07T12:00:00Z').getTime();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Test task',
    clienteId: 'c1',
    projetoId: 'p1',
    pessoaId: 'u1',
    prioridade: 'P2',
    esforco: 0,
    complexidade: 'media',
    prazo: '',
    status: 'backlog',
    subetapa: 'backlog',
    bloqueadoPor: '',
    visivelCliente: false,
    criadoEm: NOW - 10 * 86400000,
    statusEm: NOW - 10 * 86400000,
    subetapaEm: NOW - 10 * 86400000,
    andamentoEm: 0,
    ordem: null,
    bloqueadaPorTasks: [],
    checklist: [],
    reopenCount: 0,
    escopo: [],
    tempoRealHoras: null,
    externalSource: '',
    externalId: '',
    arquivadoEm: null,
    criadoPorIa: false,
    triadaEm: null,
    triadaPor: null,
    motivoArquivamento: null,
    privada: false,
    webhookSyncStatus: '',
    webhookSyncError: '',
    ...overrides,
  };
}

function makePessoa(overrides: Partial<Pessoa> = {}): Pessoa {
  return {
    id: 'u1',
    nome: 'Ana',
    email: 'ana@test.com',
    user_id: null,
    invited_at: '2026-01-01',
    role: 'interno',
    cliente_id: null,
    cliente_principal_id: null,
    cliente_secundario_id: null,
    capacidade_horas_semana: 40,
    skills: ['frontend', 'design'],
    senioridade: 'pleno',
    ...overrides,
  };
}

function makeCliente(overrides: Partial<Cliente> = {}): Cliente {
  return {
    id: 'c1',
    nome: 'Acme',
    tier: 'standard',
    ehInterno: false,
    arquivadoEm: null,
    dominios: [],
    webhookEnabled: false,
    corPortal: null,
    corPortalTexto: null,
    ...overrides,
  };
}

// ─── C.8 · SLA Breach ───────────────────────────────────────────────────────

describe('computeSLABreach', () => {
  it('returns zero stats when no concluded tasks with prazo', () => {
    const tasks = [makeTask({ status: 'backlog' })];
    const r = computeSLABreach(tasks);
    expect(r.overall.total).toBe(0);
    expect(r.overall.rate).toBe(0);
  });

  it('detects no breach when concluded before prazo', () => {
    // concluded on June 5, prazo June 7
    const concludedAt = new Date('2026-06-05T10:00:00Z').getTime();
    const tasks = [makeTask({ status: 'concluido', prazo: '2026-06-07', statusEm: concludedAt })];
    const r = computeSLABreach(tasks);
    expect(r.overall.total).toBe(1);
    expect(r.overall.breached).toBe(0);
    expect(r.overall.rate).toBe(0);
  });

  it('detects breach when concluded after prazo EOD', () => {
    // prazo June 5, concluded June 7
    const concludedAt = new Date('2026-06-07T10:00:00Z').getTime();
    const tasks = [makeTask({ status: 'concluido', prazo: '2026-06-05', statusEm: concludedAt })];
    const r = computeSLABreach(tasks);
    expect(r.overall.breached).toBe(1);
    expect(r.overall.rate).toBe(1);
  });

  it('groups correctly by cliente, projeto, pessoa', () => {
    const concludedLate  = new Date('2026-06-07T10:00:00Z').getTime();
    const concludedOnTime = new Date('2026-06-04T10:00:00Z').getTime();
    const tasks = [
      makeTask({ id: 't1', status: 'concluido', prazo: '2026-06-05', statusEm: concludedLate,  clienteId: 'c1', projetoId: 'p1', pessoaId: 'u1' }),
      makeTask({ id: 't2', status: 'concluido', prazo: '2026-06-07', statusEm: concludedOnTime, clienteId: 'c1', projetoId: 'p2', pessoaId: 'u2' }),
    ];
    const r = computeSLABreach(tasks);
    expect(r.overall.total).toBe(2);
    expect(r.overall.breached).toBe(1);
    expect(r.byCliente.get('c1')!.total).toBe(2);
    expect(r.byProjeto.get('p2')!.breached).toBe(0);
    expect(r.byPessoa.get('u1')!.rate).toBe(1);
    expect(r.byPessoa.get('u2')!.rate).toBe(0);
  });
});

// ─── C.3 · Skill mismatch ───────────────────────────────────────────────────

describe('computeSkillMismatches', () => {
  it('returns empty when task has no escopo', () => {
    const tasks = [makeTask({ escopo: [] })];
    const pessoas = new Map([['u1', makePessoa()]]);
    expect(computeSkillMismatches(tasks, pessoas)).toHaveLength(0);
  });

  it('returns empty when pessoa has all required skills', () => {
    const tasks = [makeTask({ escopo: ['frontend'] })];
    const pessoas = new Map([['u1', makePessoa({ skills: ['frontend', 'backend'] })]]);
    expect(computeSkillMismatches(tasks, pessoas)).toHaveLength(0);
  });

  it('detects missing skills', () => {
    const tasks = [makeTask({ escopo: ['frontend', 'backend'] })];
    const pessoas = new Map([['u1', makePessoa({ skills: ['frontend'] })]]);
    const result = computeSkillMismatches(tasks, pessoas);
    expect(result).toHaveLength(1);
    expect(result[0].missingSkills).toEqual(['backend']);
  });

  it('ignores concluded and archived tasks', () => {
    const tasks = [
      makeTask({ id: 't1', escopo: ['backend'], status: 'concluido' }),
      makeTask({ id: 't2', escopo: ['backend'], arquivadoEm: '2026-01-01' }),
    ];
    const pessoas = new Map([['u1', makePessoa({ skills: [] })]]);
    expect(computeSkillMismatches(tasks, pessoas)).toHaveLength(0);
  });
});

// ─── C.4 · Senioridade malalocada ───────────────────────────────────────────

describe('computeSenioridadeAlerts', () => {
  it('flags risco_qualidade: alta + junior', () => {
    const tasks = [makeTask({ complexidade: 'alta' })];
    const pessoas = new Map([['u1', makePessoa({ senioridade: 'junior' })]]);
    const result = computeSenioridadeAlerts(tasks, pessoas);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('risco_qualidade');
  });

  it('flags desperdicio: baixa + senior', () => {
    const tasks = [makeTask({ complexidade: 'baixa' })];
    const pessoas = new Map([['u1', makePessoa({ senioridade: 'senior' })]]);
    const result = computeSenioridadeAlerts(tasks, pessoas);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('desperdicio');
  });

  it('returns nothing for pleno (neutral)', () => {
    const tasks = [makeTask({ complexidade: 'alta' })];
    const pessoas = new Map([['u1', makePessoa({ senioridade: 'pleno' })]]);
    expect(computeSenioridadeAlerts(tasks, pessoas)).toHaveLength(0);
  });

  it('returns nothing for media complexity', () => {
    const tasks = [makeTask({ complexidade: 'media' })];
    const pessoas = new Map([['u1', makePessoa({ senioridade: 'junior' })]]);
    expect(computeSenioridadeAlerts(tasks, pessoas)).toHaveLength(0);
  });

  it('ignores concluded tasks', () => {
    const tasks = [makeTask({ complexidade: 'alta', status: 'concluido' })];
    const pessoas = new Map([['u1', makePessoa({ senioridade: 'junior' })]]);
    expect(computeSenioridadeAlerts(tasks, pessoas)).toHaveLength(0);
  });
});

// ─── C.7 · Bottleneck ───────────────────────────────────────────────────────

describe('computeBottlenecks', () => {
  it('returns empty for no open tasks', () => {
    const tasks = [makeTask({ status: 'concluido' })];
    expect(computeBottlenecks(tasks, NOW)).toHaveLength(0);
  });

  it('computes days in current subetapa', () => {
    const tasks = [
      makeTask({ subetapa: 'em_desenvolvimento', subetapaEm: NOW - 10 * 86400000 }),
      makeTask({ id: 't2', subetapa: 'em_desenvolvimento', subetapaEm: NOW - 20 * 86400000 }),
    ];
    const result = computeBottlenecks(tasks, NOW);
    expect(result).toHaveLength(1);
    const r = result[0];
    expect(r.subetapa).toBe('em_desenvolvimento');
    expect(r.count).toBe(2);
    expect(r.mediana).toBe(10); // p50 of [10, 20] sorted = idx 0 = 10
    expect(r.p90).toBe(20);
  });

  it('ignores archived tasks', () => {
    const tasks = [makeTask({ arquivadoEm: '2026-01-01', subetapaEm: NOW - 5 * 86400000 })];
    expect(computeBottlenecks(tasks, NOW)).toHaveLength(0);
  });
});

// ─── C.5 · Churn risk ───────────────────────────────────────────────────────

describe('computeChurnRisk', () => {
  it('returns empty when no external clients have tasks', () => {
    const tasks = [makeTask({ clienteId: 'interno' })];
    const clientes = [makeCliente({ id: 'interno', ehInterno: true })];
    expect(computeChurnRisk(tasks, clientes, NOW)).toHaveLength(0);
  });

  it('assigns score for task bloqueada há >14d', () => {
    const tasks = [makeTask({
      subetapa: 'bloqueado',
      subetapaEm: NOW - 20 * 86400000,
      status: 'bloqueado',
    })];
    const clientes = [makeCliente()];
    const result = computeChurnRisk(tasks, clientes, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBeGreaterThanOrEqual(25);
    expect(result[0].sinais.tasksBloquadas14d).toBe(1);
  });

  it('assigns score for sem entrega há >30d', () => {
    const tasks = [
      makeTask({ status: 'concluido', statusEm: NOW - 40 * 86400000 }),
    ];
    const clientes = [makeCliente()];
    const result = computeChurnRisk(tasks, clientes, NOW);
    expect(result[0].sinais.diasSemEntrega).toBeGreaterThan(30);
    expect(result[0].score).toBeGreaterThanOrEqual(30);
  });

  it('does not return clients with score 0', () => {
    const tasks = [makeTask({ status: 'concluido', statusEm: NOW - 2 * 86400000, prazo: '2026-06-10' })];
    const clientes = [makeCliente()];
    // entrega recente, sem sinais disparados
    expect(computeChurnRisk(tasks, clientes, NOW)).toHaveLength(0);
  });

  it('caps score at 100 and returns critico when >=70', () => {
    // all 4 signals fire: score = 25+30+25+20 = 100
    const tasks = [
      makeTask({ subetapa: 'bloqueado', status: 'bloqueado', subetapaEm: NOW - 20 * 86400000 }),
      makeTask({ id: 't2', status: 'concluido', statusEm: NOW - 40 * 86400000, prazo: '2026-01-01' }),
      makeTask({ id: 't3', subetapa: 'em_definicao', status: 'andamento', subetapaEm: NOW - 25 * 86400000 }),
    ];
    const clientes = [makeCliente()];
    const result = computeChurnRisk(tasks, clientes, NOW);
    expect(result[0].score).toBe(100);
    expect(result[0].level).toBe('critico');
  });
});

// ─── C.2 · Capacidade prevista ───────────────────────────────────────────────

describe('computeCapacidade', () => {
  it('returns Infinity and critico when no recent throughput', () => {
    const tasks = [makeTask({ status: 'backlog' })];
    const r = computeCapacidade(tasks, NOW);
    expect(r.semanas_estouro).toBe(Infinity);
    expect(r.nivel).toBe('critico');
  });

  it('computes semanas_estouro correctly', () => {
    // 8 concluídas nas últimas 4 semanas = 2/semana; 6 abertas → 3 semanas
    const concluded = Array.from({ length: 8 }, (_, i) =>
      makeTask({ id: `c${i}`, status: 'concluido', statusEm: NOW - i * 86400000 }),
    );
    const open = Array.from({ length: 6 }, (_, i) =>
      makeTask({ id: `o${i}`, status: 'backlog' }),
    );
    const r = computeCapacidade([...concluded, ...open], NOW);
    expect(r.throughput_semana).toBe(2);
    expect(r.backlog_aberto).toBe(6);
    expect(r.semanas_estouro).toBe(3);
    expect(r.nivel).toBe('ok');
  });

  it('groups byPessoa correctly', () => {
    const concluded = [
      makeTask({ id: 'c1', status: 'concluido', statusEm: NOW - 5 * 86400000, pessoaId: 'u1' }),
      makeTask({ id: 'c2', status: 'concluido', statusEm: NOW - 6 * 86400000, pessoaId: 'u1' }),
    ];
    const open = [
      makeTask({ id: 'o1', status: 'backlog', pessoaId: 'u1' }),
      makeTask({ id: 'o2', status: 'backlog', pessoaId: 'u1' }),
    ];
    const r = computeCapacidade([...concluded, ...open], NOW);
    const u1 = r.byPessoa.find((p) => p.pessoaId === 'u1')!;
    expect(u1.throughput_semana).toBe(0.5); // 2/4
    expect(u1.backlog_aberto).toBe(2);
    expect(u1.semanas_estouro).toBe(4);
  });
});
