# STATUS.md — estado vivo do roadmap

> Fonte única de verdade do estado atual. Ler/atualizar todo começo de sessão relevante.
> `ROADMAP.md` = arquivo histórico imutável — não editar para refletir estado corrente.
>
> **Versão**: v1.02.232 · **Atualizado**: 03/06/2026 · branch `feat/design-system-repaginacao`

---

## ✅ Marcos concluídos

### Cutover (jun/2026)
- ✅ Vercel + Netlify fallback + Realtime publication ativada
- ✅ JWT 1h + refresh token via `TOKEN_REFRESHED`
- ✅ `usage_events` + `task_dependencies` + `task_status_history` dropadas
- ✅ Alpine no Netlify desativado

### Pós-cutover (jun/2026)
- ✅ Dashboard cockpit operacional (mai/2026)
- ✅ Briefing executivo + colapsável + conquistas W-1 (mai/2026)
- ✅ Portal cliente v2 portado pro Next (jun/2026)
- ✅ Calendário · filtro de Status
- ✅ Bloqueado exige `bloqueadoPor` + comentário inline
- ✅ Kliente 360 · só admin cria task neste cliente
- ✅ Escopo da task + skills da pessoa (matching no dropdown)
- ✅ Briefing · disciplina de comentário + dot de novo comentário
- ✅ Cronômetro start/stop + aba Timesheet
- ✅ Mobile FAB + Badge PWA (atrasadas)
- ✅ Tasks criadas por IA · chip 🤖 + filtros
- ✅ Notificações por tipo (mention/assigned/status/cliente_respondeu)
- ✅ Audit completo · stack 100% homogêneo · Drizzle removido · Cadastros 75% mais rápido (v1.02.226–229)
- ✅ Docs HOWTO + ONBOARDING atualizados pós-cutover (v1.02.230)

---

## 🎯 Roadmap ativo

> 3 buckets temáticos. Cada item tem tipo (sem IA / com IA / heurística), esforço estimado e impacto previsto. Ordem dentro de cada bucket é sugestão de prioridade, não obrigação.

### Bucket A · UX e Melhorias Gerais (sem IA)

Comportamento, performance UX, novos componentes, polimento visual. **Não invoca LLM.**

| # | Item | Esforço | Impacto |
|---|---|---|---|
| A.1 | **Aplicar novo design system** · 🟡 em validação na branch `feat/design-system-repaginacao` (tokens DS, Inter+JetBrains Mono, frosted-glass header, aperture com gradiente, ícones Lucide). Modais task/cadastros + dark mode ficam em PR seguinte. | 3-6 semanas | Alto — coesão visual + base pra evoluções |
| A.2 | **Filtros padronizados + Calendário redesign** · 🟡 em validação junto com A.1. Componente `<FilterBar>` único reutilizável em Backlog/Kanban/Calendário/Dashboard/Timesheet. PillsFilter em Foco/Triagem. Calendário: status como cor no bloquinho + setas ‹ › ao lado do title. | 1-2 semanas | Alto — coesão entre Backlog/Kanban/Calendário/Dashboard + correção da busca |
| A.3 | **Push notifications** · VAPID + Edge Function `send-push` + UI de permissão (Badge API já ✅) | 2-3 semanas | Alto — comportamental forte, iOS 16.4+ PWA |
| A.4 | **Triagem obrigatória pra tasks criadas por IA** · flag `triada_em` + filtro próprio | 3-5 dias | Médio — governance pré-IA |
| A.5 | **Saved views / filtros nomeados** · "Minhas atrasadas", "Aguardando cliente X". Depende de A.2. | 2-3 dias | Quick win UX alto impacto |
| A.6 | **Sticky thead Backlog** · cabeçalho fixo em scroll longo | 2-3 dias | Quick win UX |
| A.7 | **PDF Resumo Executivo** · consolidar Briefing+Dashboard em documento navegável | 1-2 semanas | Médio — reuniões offline |
| A.8 | **Workspaces · 3 pilares** (Salesforce · Dados · IA) · switcher topo + `workspace_id` em tabelas core + RLS por workspace | ⚠️ M-L · precisa spec própria | Estratégico — separação completa de ambientes |

#### A.2 · detalhamento

**Objetivo**: criar um **componente único `<FilterBar>`** reutilizável em Backlog / Kanban / Calendário / Dashboard, eliminando inconsistências e habilitando saved views (A.5) sem refactor.

**Filtros padronizados** (todos as 4 abas):
- 🔍 **Buscar** — full-text em **todos os campos** (título, descrição, comentários, tags, etc), não só no título como hoje
- **Cliente** (select)
- **Projeto** (select dependente de Cliente)
- **Responsável** (select)
- **Prazo** (range / quick-picks: hoje · esta semana · este mês · atrasadas · sem prazo)

**Menu ⋯ contextual** (padrão em todas as 4 abas, opções habilitadas conforme contexto):
- **Backlog** (referência canônica): Grupar por · Mostrar arquivadas · Somente criadas por IA / só humanos
- **Kanban**: Mostrar arquivadas · Somente criadas por IA — Grupar fica disabled (kanban já agrupa por subetapa)
- **Calendário**: Mostrar arquivadas — Grupar e filtro IA ficam disabled
- **Dashboard**: Somente criadas por IA / só humanos — Grupar disabled, Mostrar arquivadas disabled (dashboard ignora arquivadas por design)

**Calendário · redesign visual**:
- Filtro de Status SAI da barra → vira **código de cor em cada bloquinho** de task dentro do dia (verde=concluído, brand=andamento, âmbar=bloqueado, cinza=backlog)
- Botões **‹ ›** de avançar/voltar mês saem do canto direito → ficam **ao lado do title do mês** (ex: `‹ Junho 2026 ›`)
- Resto da FilterBar aplica normal

**Dashboard · exceções**:
- Alguns elementos/cards podem ser definidos como **"não afetados por filtros"** (ex: KPIs globais, heatmap de capacidade do time inteiro, throughput agregado). Marcação via prop no card — UX mostra um ícone discreto "🔒 visão global" quando filtros estão ativos mas o card ignora.
- Filtros padrão aplicam ao resto do Dashboard.

**Implementação técnica sugerida**:
- Novo componente `src/components/filter-bar.tsx` com props tipadas (lista de filtros habilitados, callbacks, slot de menu ⋯)
- Estado de filtros vira hook `useFilters(scope)` que persiste em URL/localStorage por tela (habilita deep-link e saved views)
- Cada tela passa só os filtros que faz sentido (mas todas usam o mesmo componente)
- A.5 (Saved views) reusa esse `useFilters` direto — quase grátis depois desse refactor

**Pré-req**: idealmente sai junto com A.1 (Design System) — barra de filtros é componente visível em 4 telas, vale aplicar tokens novos de uma vez só pra evitar reapplicar depois.

### Bucket B · Features com IA

Tarefas que invocam LLM (Claude Haiku/Sonnet) pra produzir saída útil ao usuário. **Pré-req comum**: chave Anthropic em env do Supabase + Edge Function pattern + observabilidade de custo/uso.

| # | Item | Modelo · Custo | Esforço | Impacto |
|---|---|---|---|---|
| B.1 | **`ai-suggest`** · sugere cliente/projeto/responsável ao criar task | Haiku · ~R$0,015/exec | ~1 semana | ⭐ Fecha gap competitivo #1. Bom ponto de entrada de IA. |
| B.2 | **`ai-weekly-summary`** · resumo executivo da semana, cron sábado | Sonnet · ~R$0,10/exec semanal | 4-5 dias | ⭐⭐ Aba "Insights". Sócio lê portfólio em 5min. |
| B.3 | **Resumir thread de task** · botão "TL;DR" no modal | Sonnet · ~R$0,05/exec sob demanda | ~1 dia | Quick win — primeira IA low-risk/high-value visível ao usuário |
| B.4 | **Auto-triage com IA** · classifica tasks criadas por IA antes da Triagem | Haiku · ~R$0,02/exec | M (depende de A.3) | Combina com `ai-suggest`. Limpa fila da Triagem. |
| B.5 | **Aba Foco com IA leve** · resumo do dia + 3 tasks priorizadas | Haiku · ~R$0,02/exec por usuário/dia | M | Personalização real do Meu foco |
| B.6 | **`ai-chat` com tool use** · chat com backlog via ⌘K (busca + filtros + agregações) | Sonnet · custo variável | L (precisa cuidado com prompt injection) | Diferenciador real, mas adiar até B.1+B.2 validados em prod |

### Bucket C · Heurísticas para Advanced Analytics

Detecção de padrões e insights avançados sobre o estado da operação. Pode usar IA ou puro SQL/agregação. **Output é insight/score/alerta** consumido em Dashboard ou Briefing.

| # | Item | Tipo | Esforço | Impacto |
|---|---|---|---|---|
| C.1 | **`ai-risk-scanner`** · banner "🚨 N sinais hoje" no Dashboard (cron diário) | IA (Sonnet) · ~R$0,30/dia | ~1 semana | ⭐ Premium-perception alta. Depende de Dashboard estar no ar. |
| C.2 | **Capacidade prevista** · heurística "estoura em N semanas" baseada em throughput vs backlog | Pura (SQL + agregação) | M (precisa `weekly_capacity_snapshots` + job semanal) | Antecipa contratação/desaceleração |
| C.3 | **Skill mismatch** · task de escopo X atribuída a pessoa sem skill | Pura (cruzamento `tasks.escopo` × `pessoas.skills`) | 3-5 dias | Qualidade de alocação |
| C.4 | **Senioridade malalocada** · júnior fazendo task de complexidade alta (ou inverso) | Pura | 3-5 dias | Risco de qualidade / desperdício |
| C.5 | **Churn risk por cliente** · sinal composto (lead time + reclamações + comments negativos) | Pura + opcional IA pra sentimento | M | Antecipa perda de cliente |
| C.6 | **Cliente em fricção via NLP** · análise de comments públicos pra detectar tom | IA (Sonnet) | M | Sinal precoce, complementa C.5 |
| C.7 | **Bottleneck por sub-etapa** · histograma de tempo médio em cada subetapa, identifica gargalo | Pura | 3-5 dias | Otimização de fluxo |
| C.8 | **SLA breach rate** · % de SLA violados por cliente/projeto na janela | Pura | 2-3 dias | Métrica contratual |
| C.9 | **Margem por hora vs ticket** · custo de pessoa × tempo × tipo de projeto | Pura (precisa custo/h da pessoa) | M | Precificação data-driven |

---

## ❌ Descontinuados (não repropor sem novo input)

Tags · Tipo de trabalho · Dependências UI · Templates de projeto · WhatsApp digest · Slack integration · iCal feed · Triage inbox Linear-style · Importação CSV · File/Protocol/Share handlers · Multi-workspace externo · Faturamento NFe · API pública · Aba Adoção · Email digest semanal · Notif digest hourly · Sentry · PostHog

---

## 📜 Promessas centrais

| Promessa | Status |
|---|---|
| Visibilidade gerencial (Dashboard + Briefing) | ✅ Entregue mai/2026 |
| Colaboração viva (realtime) | ✅ Ativo desde cutover jun/2026 |
| Portal cliente | ✅ Entregue jun/2026 |
| Time tracking (cronômetro) | ✅ Entregue jun/2026 |
| Stack homogêneo e enxuto | ✅ Auditado e limpo (v1.02.226–229) |
| Diferenciação por IA | ❌ Zero em prod — atacar via Bucket B |
| Analytics avançado | ⚠️ Heurísticas Onda A-D entregues — Bucket C adiciona profundidade |

---

## Próximo passo imediato

→ **Design system (A.1) + Filtros padronizados (A.2)** juntos — barra de filtros é componente visível em 4 telas, vale aplicar tokens novos de uma vez. Evita retrabalho.
→ Em paralelo (outra pessoa/sessão): **`ai-suggest` (B.1)** como primeira IA em prod (mais barato/seguro de validar).
→ Depois disso, escolher entre completar Bucket A (A.3+) ou avançar Bucket C (C.1+).
