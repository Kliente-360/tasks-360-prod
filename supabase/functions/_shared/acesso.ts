/**
 * Acesso nas funções usadas pelo MCP: as mesmas regras do app.
 *
 * Quem chama vem do header x-tasks360-user (e-mail do login Google no MCP):
 *   - 'sistema'     · sem header: automações com a chave de API (rotina de
 *                     standup, Apps Script, token legado). Vê tudo, como antes.
 *   - 'pessoa'      · e-mail cadastrado. Segue o app: tarefa privada (dela, do
 *                     projeto ou do cliente) só para o CEO e o responsável.
 *   - 'desconhecido'· e-mail sem cadastro: não vê nada privado e não escreve.
 *
 * Também concentra as regras de fluxo de etapa do app (voltar da homologação,
 * mensagem ao enviar para homologação, motivo de bloqueio e reabertura).
 *
 * Sem Deno nem Supabase aqui: importado pelas edges e pelos testes (Vitest).
 */

export type Acesso =
  | { tipo: 'sistema' }
  | { tipo: 'desconhecido'; email: string }
  | { tipo: 'pessoa'; id: string; nome: string; role: string; isCeo: boolean };

export interface PessoaRow { id: string; nome: string | null; role: string; is_ceo: boolean | null }

/** Monta o acesso a partir do e-mail do header e da pessoa encontrada (ou não). */
export function acessoDe(email: string, pessoa: PessoaRow | null | undefined): Acesso {
  if (!email) return { tipo: 'sistema' };
  if (!pessoa) return { tipo: 'desconhecido', email };
  return { tipo: 'pessoa', id: pessoa.id, nome: pessoa.nome ?? '', role: pessoa.role, isCeo: pessoa.is_ceo === true };
}

export interface TarefaAcesso {
  privada?: boolean | null;
  pessoa_id?: string | null;
  cliente_privado?: boolean | null;
  projeto_privado?: boolean | null;
}

/** Privada de fato: marcada na tarefa, ou herdada do projeto ou do cliente. */
export function tarefaPrivada(t: TarefaAcesso): boolean {
  return !!(t.privada || t.cliente_privado || t.projeto_privado);
}

export function podeVerTarefa(a: Acesso, t: TarefaAcesso): boolean {
  if (!tarefaPrivada(t)) return true;
  if (a.tipo === 'sistema') return true;
  if (a.tipo === 'desconhecido') return false;
  return a.isCeo || (!!t.pessoa_id && t.pessoa_id === a.id);
}

/** Escrever (atualizar, comentar, lançar horas) exige ser do time. */
export function podeEscrever(a: Acesso): boolean {
  if (a.tipo === 'sistema') return true;
  if (a.tipo === 'desconhecido') return false;
  return a.role === 'admin' || a.role === 'interno';
}

// ── Fluxo de etapas (espelha o modal do app) ─────────────────────────────

const GRUPO_BACKLOG = ['backlog', 'priorizado', 'em_definicao', 'escopo_definido'];
const DA_HOMOLOGACAO = ['em_homologacao', 'pronto_producao', 'em_implantacao'];
export const MOTIVOS_REABERTURA = ['mudanca_cliente', 'erro_qualidade', 'regressao', 'novo_requisito'] as const;

export type Exigencia =
  | { campo: 'mensagem'; visivelCliente: true; motivo: string }
  | { campo: 'justificativa'; visivelCliente: true; motivo: string }
  | { campo: 'motivo'; visivelCliente: boolean; motivo: string }
  | { campo: 'motivo_reabertura'; motivo: string }
  | null;

/** O que a mudança de etapa exige, como no app. null = nada além da etapa. */
export function exigenciaDaTransicao(de: string, para: string, bloqueadoPor?: string): Exigencia {
  if (de === para) return null;
  if (para === 'bloqueado') {
    return { campo: 'motivo', visivelCliente: bloqueadoPor === 'cliente', motivo: 'bloquear pede o motivo (com bloqueado_por=cliente, vira a pergunta para o cliente)' };
  }
  if (de === 'concluido') {
    return { campo: 'motivo_reabertura', motivo: `reabrir uma tarefa concluída pede motivo_reabertura (${MOTIVOS_REABERTURA.join(', ')})` };
  }
  if (DA_HOMOLOGACAO.includes(de) && (GRUPO_BACKLOG.includes(para) || para === 'em_desenvolvimento' || para === 'em_revisao')) {
    return { campo: 'justificativa', visivelCliente: true, motivo: 'voltar da homologação para ajuste pede a justificativa, que vai para a conversa (o cliente vê)' };
  }
  if (para === 'em_homologacao' && !DA_HOMOLOGACAO.includes(de)) {
    return { campo: 'mensagem', visivelCliente: true, motivo: 'enviar para homologação pede a mensagem para o cliente (o que foi entregue e como testar)' };
  }
  return null;
}
