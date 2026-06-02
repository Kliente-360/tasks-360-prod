/**
 * Constantes de domínio — portadas de lib/helpers.js + lib/app.js do Alpine.
 * Mantidas como objetos `as const` pra TypeScript inferir os literal types.
 */

export const STATUS = {
  BACKLOG: 'backlog',
  ANDAMENTO: 'andamento',
  BLOQUEADO: 'bloqueado',
  CONCLUIDO: 'concluido',
} as const;

export const ROLE = {
  ADMIN: 'admin',
  INTERNO: 'interno',
  CLIENTE: 'cliente',
} as const;

export const SUB_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  priorizado: 'Priorizado',
  em_definicao: 'Em definição',
  escopo_definido: 'Escopo definido',
  em_desenvolvimento: 'Em desenvolvimento',
  em_homologacao: 'Em homologação',
  em_revisao: 'Em revisão',
  pronto_producao: 'Pronto p/ produção',
  em_implantacao: 'Em implantação',
  bloqueado: 'Bloqueado',
  concluido: 'Concluído',
};

export const SUB_TO_MACRO: Record<string, string> = {
  backlog: 'backlog',
  priorizado: 'backlog',
  em_definicao: 'backlog',
  escopo_definido: 'backlog',
  em_desenvolvimento: 'andamento',
  em_homologacao: 'andamento',
  em_revisao: 'andamento',
  pronto_producao: 'andamento',
  em_implantacao: 'andamento',
  bloqueado: 'bloqueado',
  concluido: 'concluido',
};

export const SUBS_FLAT = [
  'backlog',
  'priorizado',
  'em_definicao',
  'escopo_definido',
  'em_desenvolvimento',
  'em_homologacao',
  'em_revisao',
  'pronto_producao',
  'em_implantacao',
  'bloqueado',
  'concluido',
] as const;

/** Ordem visual das sub-etapas (mapa nome→índice). Pré-computado fora
 *  de hot paths (era recriado a cada filter/sort em Backlog/Kanban). */
export const SUBS_FLAT_ORDER: Record<string, number> = Object.fromEntries(
  SUBS_FLAT.map((s, i) => [s, i]),
);

/** Rank das sub-etapas pra detectar tasks "incompletas" em etapa avançada. */
export const STAGE_RANK: Record<string, number> = {
  backlog: 0,
  em_definicao: 1,
  priorizado: 2,
  escopo_definido: 3,
  em_desenvolvimento: 4,
  em_homologacao: 5,
  em_revisao: 6,
  pronto_producao: 7,
  em_implantacao: 8,
  bloqueado: -1,
  concluido: -1,
};

// ─── Skills / Escopo ─────────────────────────────────────────────────────────

export const SKILL_GROUPS = [
  {
    group: 'Salesforce',
    values: ['Admin', 'Flow', 'Apex', 'LWC', 'Integração', 'Arquitetura', 'Consultoria'],
  },
  {
    group: 'Clouds',
    values: ['Sales Cloud', 'Service Cloud', 'Marketing Cloud'],
  },
  {
    group: 'Digital / IA',
    values: ['WhatsApp', 'Bot', 'Agentforce'],
  },
] as const;

export const ALL_SKILLS = SKILL_GROUPS.flatMap((g) => g.values) as string[];
