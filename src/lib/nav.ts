/**
 * Abas do app. Espelha o tabsList de lib/app.js do app atual.
 * `onda` indica em qual onda do rebuild a tela é portada de verdade.
 */
export type NavItem = {
  href: string;
  label: string;
  roles: ReadonlyArray<'admin' | 'interno' | 'cliente'>;
  onda: number;
  /** Esconde a tab no mobile (mantida no desktop). Espelha hideMobile do tabsList Alpine. */
  hideMobile?: boolean;
  /** Sai da tab bar (em todos os breakpoints) e vive no menu do perfil. Espelha inProfileMenu Alpine. */
  inProfileMenu?: boolean;
};

// Ordem v1.03 (jun/2026): briefing primeiro (cabeçalho da operação),
// triagem antes do foco (filtro do dia), foco/backlog/kanban/calendário
// formam o miolo operacional, dashboard/timesheet/portal fecham.
export const NAV: ReadonlyArray<NavItem> = [
  { href: '/briefing',   label: 'Briefing',      roles: ['admin'],                     onda: 1 },
  // Triagem escondida no mobile: bulk actions e leitura paralela dos chips
  // de falhas funcionam melhor no desktop; quem precisar triar no celular
  // usa o /backlog filtrando por "sem responsável" etc.
  { href: '/triagem',    label: 'Triagem',       roles: ['admin'],                     onda: 1, hideMobile: true },
  { href: '/foco',       label: 'Meu foco',      roles: ['admin', 'interno'],          onda: 1 },
  { href: '/backlog',    label: 'Backlog',       roles: ['admin', 'interno'],          onda: 1 },
  // Kanban escondido no mobile: 11 colunas operacionais não cabem em viewport
  // estreito e a executiva é melhor servida pelo /backlog mobile.
  { href: '/kanban',     label: 'Kanban',        roles: ['admin', 'interno'],          onda: 1, hideMobile: true },
  { href: '/calendario', label: 'Calendário',    roles: ['admin', 'interno'],          onda: 1 },
  { href: '/dashboard',  label: 'Dashboard',     roles: ['admin', 'interno'],          onda: 1 },
  { href: '/timesheet',  label: 'Timesheet',     roles: ['admin', 'interno'],          onda: 1, hideMobile: true },
  { href: '/portal',     label: 'Portal cliente', roles: ['admin', 'interno', 'cliente'], onda: 2 },
  // Cadastros sai da tab bar (espelha inProfileMenu do Alpine) — vive no
  // dropdown do avatar pra liberar espaço horizontal nas abas principais.
  { href: '/cadastros',  label: 'Cadastros',     roles: ['admin'],                     onda: 1, inProfileMenu: true },
  // Adoção removida: PostHog cobre a camada comportamental (mai/2026).
] as const;
