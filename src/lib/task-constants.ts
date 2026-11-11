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

/** Área técnica da task (nov/2026) · escolha única e opcional, no lugar do
 *  escopo com 13 opções. Sales e Service ficam implícitos (o core). */
export const AREAS_TECNICAS = [
  { v: 'configuracao', label: 'Configuração', exemplos: 'Admin, Permissão, App Builder' },
  { v: 'automacao', label: 'Automação', exemplos: 'Flow, Apex' },
  { v: 'canais_ia', label: 'Canais e IA', exemplos: 'WhatsApp, Bot, Agentforce' },
  { v: 'integracao', label: 'Integração', exemplos: 'APIs, Conectores' },
  { v: 'frontend', label: 'Front-end', exemplos: 'LWC' },
  { v: 'marketing', label: 'Marketing Cloud', exemplos: 'Jornadas, Segmentação, Disparos' },
  { v: 'consultoria', label: 'Consultoria', exemplos: 'Diagnóstico, Arquitetura, Pré-venda' },
  { v: 'relatorios', label: 'Relatórios', exemplos: 'Análises, Indicadores, Dashboards' },
] as const;
export type AreaTecnica = (typeof AREAS_TECNICAS)[number]['v'];
export const AREA_LABEL: Record<string, string> = Object.fromEntries(AREAS_TECNICAS.map((a) => [a.v, a.label]));

/** Skill (cadastro da pessoa) → área técnica. Mesmo de-para da migração
 *  2026-11-10 (area_do_escopo). Sales/Service Cloud não viram área. */
export const SKILL_PARA_AREA: Record<string, AreaTecnica> = {
  Admin: 'configuracao', Flow: 'automacao', Apex: 'automacao',
  WhatsApp: 'canais_ia', Bot: 'canais_ia', Agentforce: 'canais_ia',
  'Marketing Cloud': 'marketing', 'Integração': 'integracao', LWC: 'frontend',
  Consultoria: 'consultoria', Arquitetura: 'consultoria',
};

/** Subetapas do grupo Backlog · esforço só pode mudar enquanto a task está nele. */
export const GRUPO_BACKLOG = new Set(['backlog', 'priorizado', 'em_definicao', 'escopo_definido']);

/** Tipos de trabalho · lista única usada no modal interno e no portal do
 *  cliente. `hint` explica o tipo pra quem abre a solicitação. */
export const TIPOS_TRABALHO = [
  { v: 'bug', label: 'Correção de erro', hint: 'Algo que deveria funcionar e não está funcionando.' },
  { v: 'feature', label: 'Melhoria', hint: 'Algo novo ou diferente do que existe hoje.' },
  { v: 'discovery', label: 'Dúvida ou análise', hint: 'Entender, investigar ou avaliar antes de fazer.' },
  { v: 'manutencao', label: 'Manutenção', hint: 'Ajustes de rotina: usuários, acessos, cadastros, configurações.' },
  { v: 'admin', label: 'Administrativo', hint: 'Relatórios, reuniões e apoio que não mudam o sistema.' },
] as const;
