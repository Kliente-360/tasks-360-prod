/* tasks 360 hi-fi — dados mock (consultoria CRM/Data/IA) */

const PESSOAS = [
  { id: 'p1', nome: 'Marina Alves', role: 'socio' },
  { id: 'p2', nome: 'João Diniz', role: 'consultor' },
  { id: 'p3', nome: 'Rafael Costa', role: 'consultor' },
  { id: 'p4', nome: 'Letícia Prado', role: 'consultor' },
  { id: 'p5', nome: 'Bruno Tavares', role: 'socio' },
];

const CLIENTES = [
  { id: 'c1', nome: 'Acme Corp', projetos: 4, tarefas: 38, sinal: 'verde' },
  { id: 'c2', nome: 'Globex', projetos: 2, tarefas: 21, sinal: 'amarelo' },
  { id: 'c3', nome: 'Initech', projetos: 1, tarefas: 9, sinal: 'verde' },
  { id: 'c4', nome: 'Umbrella', projetos: 3, tarefas: 17, sinal: 'vermelho' },
  { id: 'c5', nome: 'Soylent', projetos: 1, tarefas: 6, sinal: 'verde' },
];

const PROJETOS = [
  { id: 'pr1', nome: 'CRM Vendas', cliente: 'Acme Corp', tarefas: 18 },
  { id: 'pr2', nome: 'Data Lake', cliente: 'Acme Corp', tarefas: 12 },
  { id: 'pr3', nome: 'Agentforce', cliente: 'Globex', tarefas: 14 },
  { id: 'pr4', nome: 'BI Comercial', cliente: 'Umbrella', tarefas: 9 },
];

// prazo: { label, late } · status: backlog|andamento|bloqueado|concluido
const T = (id, titulo, cliente, projeto, resp, pri, status, prazo, h, cx, opts = {}) =>
  ({ id, titulo, cliente, projeto, resp, pri, status, prazo, h, cx, ...opts });

const TASKS = [
  T('t1', 'Configurar fluxo de aprovação de descontos', 'Acme Corp', 'CRM Vendas', 'Marina Alves', 'P0', 'andamento', { label: 'ontem', late: true }, 8, 'alta', { tags: ['salesforce'], ai: false }),
  T('t2', 'Modelar objeto de Oportunidade com campos custom', 'Acme Corp', 'CRM Vendas', 'João Diniz', 'P1', 'andamento', { label: '12 jun' }, 5, 'media', { tags: ['salesforce'] }),
  T('t3', 'Pipeline de ingestão dos pedidos legados', 'Acme Corp', 'Data Lake', 'Rafael Costa', 'P1', 'bloqueado', { label: '10 jun', late: true }, 13, 'alta', { tags: ['data'] }),
  T('t4', 'Dashboard de cohort de churn', 'Globex', 'Agentforce', 'Letícia Prado', 'P2', 'andamento', { label: '20 jun' }, 6, 'media', { tags: ['data', 'bi'] }),
  T('t5', 'Treinar agente de IA para triagem de leads', 'Globex', 'Agentforce', 'Bruno Tavares', 'P0', 'andamento', { label: '15 jun' }, 10, 'alta', { tags: ['ia'], ai: true }),
  T('t6', 'Revisar regras de atribuição de território', 'Initech', '', 'João Diniz', 'P2', 'backlog', { label: '—' }, 3, 'baixa', {}),
  T('t7', 'Importar base histórica de contatos (dedupe)', 'Umbrella', 'BI Comercial', 'Rafael Costa', 'P1', 'backlog', { label: '25 jun' }, 8, 'media', { tags: ['data'] }),
  T('t8', 'Definir KPIs do comitê comercial', 'Umbrella', 'BI Comercial', 'Marina Alves', 'P3', 'backlog', { label: '—' }, 2, 'baixa', {}),
  T('t9', 'Automação de follow-up pós-reunião', 'Acme Corp', 'CRM Vendas', 'Letícia Prado', 'P2', 'bloqueado', { label: '18 jun' }, 4, 'media', { ai: true }),
  T('t10', 'Documentar arquitetura de integração Salesforce ↔ ERP', 'Acme Corp', 'Data Lake', 'Bruno Tavares', 'P1', 'andamento', { label: '14 jun' }, 6, 'alta', { tags: ['salesforce', 'data'] }),
  T('t11', 'Setup de ambiente sandbox para QA', 'Soylent', '', 'João Diniz', 'P2', 'backlog', { label: '—' }, 3, 'baixa', { privada: true }),
  T('t12', 'Workshop de descoberta — pilar Dados', 'Globex', 'Agentforce', 'Marina Alves', 'P0', 'andamento', { label: 'hoje' }, 4, 'media', {}),
  T('t13', 'Validar modelo de atribuição multi-touch', 'Initech', '', 'Rafael Costa', 'P2', 'backlog', { label: '28 jun' }, 5, 'media', { tags: ['data'] }),
  T('t14', 'Migrar relatórios legados para CRM Analytics', 'Umbrella', 'BI Comercial', 'Letícia Prado', 'P1', 'backlog', { label: '30 jun' }, 9, 'alta', { tags: ['bi'] }),
  T('t15', 'Onboarding do time comercial no novo CRM', 'Acme Corp', 'CRM Vendas', 'Bruno Tavares', 'P3', 'concluido', { label: '02 jun' }, 4, 'baixa', {}),
];

const THROUGHPUT = [5, 7, 4, 8, 6, 7, 5, 9, 7, 8, 6, 9]; // 12 semanas
const CARGA = [
  { nome: 'João Diniz', pct: 72 },
  { nome: 'Marina Alves', pct: 48 },
  { nome: 'Rafael Costa', pct: 94 },
  { nome: 'Letícia Prado', pct: 61 },
  { nome: 'Bruno Tavares', pct: 55 },
];

Object.assign(window, { PESSOAS, CLIENTES, PROJETOS, TASKS, THROUGHPUT, CARGA });
