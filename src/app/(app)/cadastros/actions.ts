'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { clienteFromDb, projetoFromDb, pessoaFromDb } from '@/lib/adapters';
import type { Cliente, Projeto, Pessoa } from '@/lib/types';

// Actions retornam o registro em formato in-memory (camelCase, ms etc) pra
// o componente client aplicar via upsertX do DataProvider, evitando o
// round-trip de revalidatePath que torna a tela "lenta" comparada ao
// resto do app. Toda a UX (lista, contagens) vem do data-store em memória.

function normalizeDominio(s: string): string {
  const v = String(s || '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, '');
  if (!v || !v.includes('.')) return '';
  return v;
}

const numOrNull = (v: string): number | null => (v === '' || v == null ? null : Number(v));

// ============ Cliente ============

export type ClientePayload = {
  id?: string | null;
  nome: string;
  tier: string;
  dominios: string[];
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function saveCliente(
  p: ClientePayload,
): Promise<ActionResult<Cliente>> {
  const nome = (p.nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome obrigatório.' };
  const dominios = Array.from(
    new Set((p.dominios || []).map((d) => normalizeDominio(d)).filter(Boolean)),
  );
  const tier = p.tier || null;
  const rows = p.id
    ? await db
        .update(schema.clientes)
        .set({ nome, tier, dominios })
        .where(eq(schema.clientes.id, p.id))
        .returning()
    : await db.insert(schema.clientes).values({ nome, tier, dominios, ehInterno: false }).returning();
  if (!rows[0]) return { ok: false, error: 'Falha ao salvar.' };
  return { ok: true, data: clienteFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function arquivarCliente(id: string): Promise<ActionResult<Cliente>> {
  const rows = await db
    .update(schema.clientes)
    .set({ arquivadoEm: new Date() })
    .where(eq(schema.clientes.id, id))
    .returning();
  if (!rows[0]) return { ok: false, error: 'Cliente não encontrado.' };
  return { ok: true, data: clienteFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function desarquivarCliente(id: string): Promise<ActionResult<Cliente>> {
  const rows = await db
    .update(schema.clientes)
    .set({ arquivadoEm: null })
    .where(eq(schema.clientes.id, id))
    .returning();
  if (!rows[0]) return { ok: false, error: 'Cliente não encontrado.' };
  return { ok: true, data: clienteFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function deleteCliente(id: string): Promise<ActionResult<{ id: string }>> {
  // Regras (tasks/projetos vinculados) checadas no client antes de chamar.
  await db.delete(schema.clientes).where(eq(schema.clientes.id, id));
  return { ok: true, data: { id } };
}

// ============ Projeto ============

export type ProjetoPayload = {
  id?: string | null;
  nome: string;
  clienteId: string;
  tipo: string;
  slaRespostaHoras: string;
  slaEntregaDias: string;
  orcamentoHoras: string;
};

export async function saveProjeto(
  p: ProjetoPayload,
): Promise<ActionResult<Projeto>> {
  const nome = (p.nome || '').trim();
  if (!nome) return { ok: false, error: 'Nome obrigatório.' };
  if (!p.clienteId) return { ok: false, error: 'Cliente obrigatório.' };
  const values = {
    nome,
    clienteId: p.clienteId,
    tipo: p.tipo || null,
    slaRespostaHoras: numOrNull(p.slaRespostaHoras),
    slaEntregaDias: numOrNull(p.slaEntregaDias),
    orcamentoHoras:
      p.orcamentoHoras === '' || p.orcamentoHoras == null
        ? null
        : String(numOrNull(p.orcamentoHoras)),
  };
  const rows = p.id
    ? await db.update(schema.projetos).set(values).where(eq(schema.projetos.id, p.id)).returning()
    : await db.insert(schema.projetos).values(values).returning();
  if (!rows[0]) return { ok: false, error: 'Falha ao salvar.' };
  return { ok: true, data: projetoFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function arquivarProjeto(id: string): Promise<ActionResult<Projeto>> {
  const rows = await db
    .update(schema.projetos)
    .set({ arquivadoEm: new Date() })
    .where(eq(schema.projetos.id, id))
    .returning();
  if (!rows[0]) return { ok: false, error: 'Projeto não encontrado.' };
  return { ok: true, data: projetoFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function desarquivarProjeto(id: string): Promise<ActionResult<Projeto>> {
  const rows = await db
    .update(schema.projetos)
    .set({ arquivadoEm: null })
    .where(eq(schema.projetos.id, id))
    .returning();
  if (!rows[0]) return { ok: false, error: 'Projeto não encontrado.' };
  return { ok: true, data: projetoFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function deleteProjeto(id: string): Promise<ActionResult<{ id: string }>> {
  await db.delete(schema.projetos).where(eq(schema.projetos.id, id));
  return { ok: true, data: { id } };
}

// ============ Pessoa ============

export type PessoaPayload = {
  id?: string | null;
  nome: string;
  email: string;
  role: 'admin' | 'interno' | 'cliente';
  clienteId: string;
  clientePrincipalId: string;
  clienteSecundarioId: string;
  capacidadeHorasSemana: string;
  skills: string[];
  senioridade: string;
};

export async function savePessoa(
  p: PessoaPayload,
): Promise<ActionResult<Pessoa>> {
  const nome = (p.nome || '').trim();
  const email = (p.email || '').trim().toLowerCase();
  if (!nome) return { ok: false, error: 'Dê um nome à pessoa.' };
  if (p.role === 'cliente' && !p.clienteId) {
    return { ok: false, error: 'Cliente externo precisa de um cliente vinculado.' };
  }
  const cap = p.capacidadeHorasSemana === '' || p.capacidadeHorasSemana == null
    ? 40
    : Number(p.capacidadeHorasSemana) || 40;
  const values = {
    nome,
    email: email || null,
    role: p.role || 'interno',
    clienteId: p.role === 'cliente' ? p.clienteId || null : null,
    clientePrincipalId: p.role !== 'cliente' ? p.clientePrincipalId || null : null,
    clienteSecundarioId: p.role !== 'cliente' ? p.clienteSecundarioId || null : null,
    capacidadeHorasSemana: p.role !== 'cliente' ? String(cap) : '40',
    skills: p.role !== 'cliente' ? p.skills : [],
    senioridade: p.role !== 'cliente' ? p.senioridade || null : null,
  };
  const rows = p.id
    ? await db.update(schema.pessoas).set(values).where(eq(schema.pessoas.id, p.id)).returning()
    : await db.insert(schema.pessoas).values(values).returning();
  if (!rows[0]) return { ok: false, error: 'Falha ao salvar.' };
  return { ok: true, data: pessoaFromDb(rows[0] as unknown as Record<string, unknown>) };
}

export async function deletePessoa(id: string): Promise<ActionResult<{ id: string }>> {
  await db.delete(schema.pessoas).where(eq(schema.pessoas.id, id));
  return { ok: true, data: { id } };
}
