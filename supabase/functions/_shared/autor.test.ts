import { describe, expect, it } from 'vitest';
import { AUTOR_PADRAO, autorDoComentario } from './autor';

describe('autorDoComentario', () => {
  it('sem pessoa logada usa "Time de desenvolvimento"', () => {
    expect(autorDoComentario(null)).toEqual({ nome: 'Time de desenvolvimento', pessoaId: null });
    expect(AUTOR_PADRAO).toBe('Time de desenvolvimento');
  });

  it('com pessoa logada o autor é a pessoa', () => {
    expect(autorDoComentario({ id: 'p1', nome: 'Jessica' })).toEqual({ nome: 'Jessica', pessoaId: 'p1' });
  });

  it('a variável de ambiente sobrescreve o padrão', () => {
    expect(autorDoComentario(null, 'Esteira Salesforce')).toEqual({ nome: 'Esteira Salesforce', pessoaId: null });
  });

  it('pessoa logada continua tendo precedência sobre a variável de ambiente', () => {
    expect(autorDoComentario({ id: 'p1', nome: 'Jessica' }, 'Esteira Salesforce').nome).toBe('Jessica');
  });

  it('variável vazia ou só espaços volta ao padrão', () => {
    expect(autorDoComentario(undefined, '   ').nome).toBe('Time de desenvolvimento');
  });

  it('pessoa sem nome cai no padrão', () => {
    expect(autorDoComentario({ id: 'p1', nome: '  ' })).toEqual({ nome: 'Time de desenvolvimento', pessoaId: null });
  });
});
