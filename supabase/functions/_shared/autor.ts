/**
 * Autor de comentários criados pelo MCP (add-task-comment).
 *
 * Com pessoa identificada pelo login do MCP, o autor é ela. Sem pessoa
 * (token legado, ou e-mail sem cadastro), vale o rótulo padrão:
 * MCP_COMMENT_AUTHOR_DEFAULT, ou "Time de desenvolvimento".
 *
 * Sem Deno nem Supabase aqui: importado pela edge e pelos testes (Vitest).
 */

export const AUTOR_PADRAO = 'Time de desenvolvimento';

export interface PessoaAutora {
  id: string;
  nome: string | null;
}

export function autorDoComentario(
  pessoa: PessoaAutora | null | undefined,
  padraoDoAmbiente?: string | null,
): { nome: string; pessoaId: string | null } {
  const nomePessoa = pessoa?.nome?.trim();
  if (pessoa && nomePessoa) return { nome: nomePessoa, pessoaId: pessoa.id };
  const padrao = (padraoDoAmbiente ?? '').trim() || AUTOR_PADRAO;
  return { nome: padrao, pessoaId: null };
}
