import { describe, expect, it } from 'vitest';
import { acessoDe, exigenciaDaTransicao, podeEscrever, podeVerTarefa } from './acesso';

const ceo = acessoDe('ceo@x', { id: 'c', nome: 'CEO', role: 'admin', is_ceo: true });
const dev = acessoDe('dev@x', { id: 'd', nome: 'Dev', role: 'interno', is_ceo: false });
const fora = acessoDe('fora@x', null);
const sistema = acessoDe('', null);

describe('podeVerTarefa', () => {
  it('tarefa comum: todos veem', () => {
    for (const a of [ceo, dev, fora, sistema]) expect(podeVerTarefa(a, { privada: false })).toBe(true);
  });
  it('privada: CEO, responsável e sistema veem; os outros não', () => {
    const t = { privada: true, pessoa_id: 'x' };
    expect(podeVerTarefa(ceo, t)).toBe(true);
    expect(podeVerTarefa(sistema, t)).toBe(true);
    expect(podeVerTarefa(dev, t)).toBe(false);
    expect(podeVerTarefa(dev, { ...t, pessoa_id: 'd' })).toBe(true);
    expect(podeVerTarefa(fora, t)).toBe(false);
  });
  it('herda do cliente e do projeto', () => {
    expect(podeVerTarefa(dev, { cliente_privado: true })).toBe(false);
    expect(podeVerTarefa(dev, { projeto_privado: true })).toBe(false);
  });
});

describe('podeEscrever', () => {
  it('time e sistema escrevem; e-mail sem cadastro não', () => {
    expect(podeEscrever(dev)).toBe(true);
    expect(podeEscrever(sistema)).toBe(true);
    expect(podeEscrever(fora)).toBe(false);
  });
});

describe('exigenciaDaTransicao', () => {
  it('homologação pede mensagem; voltar dela pede justificativa', () => {
    expect(exigenciaDaTransicao('em_desenvolvimento', 'em_homologacao')?.campo).toBe('mensagem');
    expect(exigenciaDaTransicao('em_homologacao', 'em_revisao')?.campo).toBe('justificativa');
    expect(exigenciaDaTransicao('pronto_producao', 'backlog')?.campo).toBe('justificativa');
    expect(exigenciaDaTransicao('pronto_producao', 'em_homologacao')).toBeNull();
    expect(exigenciaDaTransicao('em_homologacao', 'pronto_producao')).toBeNull();
  });
  it('bloqueio pede motivo, visível só quando o cliente bloqueia', () => {
    const e = exigenciaDaTransicao('em_desenvolvimento', 'bloqueado', 'cliente');
    expect(e?.campo === 'motivo' && e.visivelCliente).toBe(true);
    const n = exigenciaDaTransicao('em_desenvolvimento', 'bloqueado', 'nos');
    expect(n?.campo === 'motivo' && n.visivelCliente).toBe(false);
  });
  it('reabrir concluída pede motivo_reabertura', () => {
    expect(exigenciaDaTransicao('concluido', 'em_revisao')?.campo).toBe('motivo_reabertura');
  });
  it('avanço comum não pede nada', () => {
    expect(exigenciaDaTransicao('backlog', 'em_desenvolvimento')).toBeNull();
    expect(exigenciaDaTransicao('pronto_producao', 'concluido')).toBeNull();
  });
});
