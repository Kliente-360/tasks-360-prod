# STATUS.md — estado vivo do roadmap

> Fonte única de verdade do estado atual. Ler/atualizar todo começo de sessão relevante.
> `ROADMAP.md` = arquivo histórico imutável — não editar para refletir estado corrente.
>
> **Versão**: v1.03.042 · **Atualizado**: 04/06/2026 · branch `main`

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

### Ciclo redesign DS (jun/2026 · v1.03.001 → v1.03.042)
Bump MINOR 02→03 marcou o fechamento desse ciclo. Concluídos:
- ✅ **A.1 · Design system aplicado** · tokens DS (Inter + JetBrains Mono, verde editorial #007A3D, aperture com gradiente horário, frosted-glass header), ícones Lucide via `<Icon>` wrapper, modais task/cadastros, dark mode global auditado (zero cores Tailwind hardcoded fora do permitido)
- ✅ **A.2 · FilterBar único** · componente padrão em Backlog/Kanban/Calendário/Dashboard/Timesheet, search 150px + 4 selects 150px largura fixa, X (Limpar) sempre presente como último elemento, leftSlot pra Kanban (toggle) e Calendário (setas de mês), busca full-text em todos os campos, gramática fixa
- ✅ **A.10 · Cadastros · tabelas com colunas plenas** · Clientes (Cliente·Tier·Domínios·Cor Portal·Cor Texto·Projetos·Tarefas), Projetos (Projeto·Cliente·Tipo·SLA Resp·Entrega·Orçamento·Tarefas), Pessoas (Nome·Email·Papel·Principal·Secundário·Senioridade·Capacidade) + subabas DS
- ✅ **Login** · split-screen escuro com aperture marca d'água (≥900px), form solo com marca no topo (<900px), copy do time aplicada
- ✅ **Mobile shell + 5 telas (Steps 1-3e)** · header reduzido, bottom tab bar fixa com 5 abas (Briefing·Foco·Backlog·Dashboard·Portal), CSS port das classes m-*/tcard/sheet/detail, telas Foco/Backlog/Dashboard/Briefing adaptadas com cards próprios, Portal polish (esconde storytelling em mobile). Task modal full-screen mobile **NÃO** entregue ainda (Step 4 isolado por causa do crash em v1.03.009)
- ✅ **Notif system DS pass** · SVGs inline trocados por `<Icon>` Lucide, tokens semânticos
- ✅ **Vercel só main** · `vercel.json` com `ignoreCommand` bloqueia preview builds
- ✅ **Cards primeira-linha padronizados em 116px** · min-h uniforme + content centralizado em todas as tabs (Foco/Backlog/Dashboard/Timesheet); 2ª linha nasce no mesmo Y
- ✅ **Webhook gate ajustado** · só dispara pra clientes com `webhook_enabled=true` (VB/CTF) E comments com `visivel_cliente=true`. Notas internas não vazam pro Salesforce
- ✅ **Dark mode finalizado** (v1.03.027-029) · aliasou os tokens novos do DS (`--green*`, `--fg*`, `--bg-app`, `--bg-alt`, `--line-soft`, `--danger-soft`, `--warn-soft`) pros equivalentes brand/ink/surface já existentes no dark; header frosted-glass com tonalidade dark correta; profile menu fecha ao clicar fora via `useClickAway` (overlay z-30 não bastava contra header z-40)
- 🟡 **A.14 · Card de task unificado (PARCIAL · só técnico)** (v1.03.032-038, 8 PRs) · sub-primitivas `<PriChip>`/`<TaskAvatar>`/`<PrazoLabel>`/`<TagIA>` extraídas + wrapper `<TaskCard>` criado, mas UI ficou idêntica ao que já era. A unificação VISUAL ficou pendente — virou A.17 (replanjar do zero)
- ✅ **A.11 · Briefing × Dashboard · clarear papel** (v1.03.041-042) · Velocidade da operação migrou do Briefing pro Dashboard. Briefing = leitura editorial (alertas + clientes em atenção + conquistas). Dashboard = números (Velocidade da operação + Entregas + Calendário + Carga por pessoa + Atenção). Card "Lead time" substituído por "Throughput W-0" com projeção; meta 8→25/sem; Ciclo e % no prazo agora com delta vs 30d anteriores
- ✅ **Calendário · concluídas visíveis** (v1.03.041) · filtro default 'abertas'→'todas' + cor distintiva (verde clarinho desbotado + line-through) em vez de cinza que confundia com backlog

---

## 🎯 Roadmap ativo

> 3 buckets temáticos. Cada item tem tipo (sem IA / com IA / heurística), esforço estimado e impacto previsto. Ordem dentro de cada bucket é sugestão de prioridade, não obrigação.

### Bucket A · UX e Melhorias Gerais (sem IA)

Comportamento, performance UX, novos componentes, polimento visual. **Não invoca LLM.**

| # | Item | Esforço | Impacto |
|---|---|---|---|
| ~~A.1~~ | ~~**Aplicar novo design system**~~ | ✅ Entregue em v1.03 (ver ciclo redesign DS acima) |
| ~~A.2~~ | ~~**Filtros padronizados + Calendário redesign**~~ | ✅ Entregue em v1.03 |
| A.3 | **Push notifications** · VAPID + Edge Function `send-push` + UI de permissão (Badge API já ✅) | 2-3 semanas | Alto — comportamental forte, iOS 16.4+ PWA |
| A.4 | **Triagem obrigatória pra tasks criadas por IA** · flag `triada_em` + filtro próprio | 3-5 dias | Médio — governance pré-IA |
| A.5 | **Saved views / filtros nomeados** · "Minhas atrasadas", "Aguardando cliente X". Depende de A.2. | 2-3 dias | Quick win UX alto impacto |
| A.6 | **Sticky thead Backlog** · cabeçalho fixo em scroll longo | 2-3 dias | Quick win UX |
| A.7 | **PDF Resumo Executivo** · consolidar Briefing+Dashboard em documento navegável | 1-2 semanas | Médio — reuniões offline |
| A.8 | **Workspaces · 3 pilares** (Salesforce · Dados · IA) · switcher topo + `workspace_id` em tabelas core + RLS por workspace | ⚠️ M-L · precisa spec própria | Estratégico — separação completa de ambientes |
| A.9 | **Timesheet · entrada manual + permissões** · permitir criar registros sem cronômetro (data/hora início + duração + task + nota); **excluir** só dono ou admin; **editar** desabilitado (registro é imutável após salvo — corrige criando novo + deletando o errado, mantém audit trail limpo) | 3-5 dias | Médio — desbloqueia retro-lançamento e fecha gap de controle |
| ~~A.10~~ | ~~**Cadastros · tabelas com colunas plenas**~~ | ✅ Entregue v1.03.022 + polish v1.03.023 (ver ciclo redesign DS acima) |
| ~~A.11~~ | ~~**Briefing × Dashboard · clarear papel**~~ | ✅ Entregue v1.03.041-042. Velocidade da operação migrou do Briefing pro Dashboard; Briefing fica editorial (alertas + clientes em atenção + conquistas); Dashboard concentra números (Velocidade + Entregas + Calendário + Carga). Card W-0 substituiu Lead time; meta throughput atualizada pra 25/sem; Ciclo e % no prazo ganharam delta vs 30d anteriores. |
| A.12 | **Dashboard × Portal cliente · padrão técnico** · auditar tecnologia/framework de cada um (parecem diferentes — Portal usa header verde escuro `--bg-portal`, Dashboard usa surface normal; estruturas de card divergem). Definir padrão único (componentes, tokens, hierarquia) e refazer ambos na versão final convergente. | 1-2 semanas | Alto — fecha o ciclo de DS nessas duas telas |
| A.13 | **Triagem · redesign UX-first** · hoje é uma lista de chips clicáveis sem affordance forte. Refazer com cards no padrão "ícone contextual à esquerda · título + sub-info · meta (tempo/chip) à direita · hover suave", agrupando por tipo de pendência (cliente respondeu / criada por IA / sem responsável). Cada card abre ação rápida inline (atribuir, marcar triada, dispensar) sem precisar entrar no modal full. Inspiração: print enviado pelo Felipe — chip do tipo no canto inferior direito, ícone com cor semântica à esquerda. | 1-2 semanas | Alto — triagem é o ponto mais friccionado do fluxo diário |
| A.14 (parcial) | **Card de task unificado** · 🟡 **só camada técnica entregue, sem mudança visual perceptível.** v1.03.032-038 dedupou JSX repetido em primitivas (`PriChip`/`TaskAvatar`/`PrazoLabel`/`TagIA`) e criou wrapper `<TaskCard>` com variantes `sm/md/lg/checkable/selected`. Mas as telas mantiveram seus markups específicos (Foco desktop = FocoCard próprio, Backlog desktop = `<table>`, Kanban = .kcard, Triagem = card-com-chips, Calendário = .kcard). Resultado: código mais limpo, **UI essencialmente idêntica ao que era antes**. | (já feito, parcial) | Médio (técnico, invisível ao usuário) |
| A.17 | **Card de task unificado · VISUAL** · **escopo redo**: A.14 entregou só dedup técnico. Falta a unificação visual real: cards iguais entre Foco desktop/mobile, Backlog mobile, Kanban, Triagem, Calendário detail. **Plano precisa ser refeito** — começar com auditoria visual real (prints lado-a-lado), decidir variante única por contexto, executar com mudança VISÍVEL em cada PR (não dedup invisível como A.14). Não tocar sem plano novo aprovado. | 1-2 semanas | Alto — entrega o que A.14 prometeu mas não cumpriu |
| A.15 | **Mobile · fechamento (Step 4 + validação real)** · 🟡 parcial: shell + 4 telas + Portal polish entregues (PRs #21-#27). Falta: (1) **Task modal full-screen mobile** (Step 4 — PR isolado, suspeito do crash v1.03.009; estratégia: dual-render desktop+mobile com CSS `display:none/block`, NÃO usar `matchMedia` em render path); (2) validar viewport/scroll em iPhone SE/Plus/iPad portrait reais; (3) tap targets ≥44px conforme HIG; (4) gestos (swipe-to-delete em listas? tap longo?); (5) Briefing "Clientes em atenção" mobile · checar se safe-cast roda em prod; (6) Portal mobile · avaliar se vale port fiel ao handoff (hoje só esconde storytelling). | 1-2 semanas | Alto — fecha o ciclo mobile com qualidade |
| A.16 | **Revisar bulk actions** · auditar BulkBar (seleção múltipla no Backlog) — UX da seleção, ações disponíveis (atribuir cliente/projeto/pessoa/prazo/prioridade/esforço, arquivar, excluir), feedback visual (sticky bar com contador), comportamento mobile (não aparece hoje). Decidir: manter no Backlog desktop, levar pro Kanban também, adicionar atalhos teclado (ESC limpa seleção, Cmd+A seleciona tudo filtrado), confirmações pra ações destrutivas. | 3-5 dias | Médio — produtividade em operações repetitivas |

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

### Bucket V · Visão cliente (pre-launch hardening)

**Objetivo macro:** abrir o produto pro **primeiro cliente em definitivo** com identidade, segurança e UX dignas. Hoje o Portal cliente existe e funciona pra clientes externos da Kliente 360, mas várias áreas precisam de polish/auditoria antes de soltar pra cliente "real" (não-interno).

Diferente dos buckets A/B/C que são features incrementais, V é **um lote coeso** — escopo é "tudo que um cliente novo encosta". Vale executar como um sprint focado de 1-2 semanas com Felipe validando cada item.

| # | Item | Esforço | Impacto |
|---|---|---|---|
| V.1 | **Portal cliente · revisão completa de UX** · auditar storytelling (header verde + KPIs + ritmo de entregas + distribuição + lead time + lista), decidir o que fica/sai pra cliente externo (vs admin trocando contexto). Hoje storytelling some no mobile — avaliar se fica mesmo ou se vale port fiel. Revisar copy ("Portal · Kliente 360", "Entregues este mês", etc) pra ficar acolhedora ao cliente externo. | 3-5 dias | Alto — é a vitrine do produto pro cliente |
| V.2 | **Indicadores e gráficos do Portal · revisão analítica** · KPIs atuais (Entregues mês · Em execução · Aguardando você · Próxima entrega) e gráficos (Ritmo 6 meses · Distribuição por projeto · Lead time + total concluídas) — auditar se métricas batem com o que o cliente quer ver, se valores casam com a realidade, se faltam ângulos (ex: NPS interno do cliente · histórico de comments · SLA cumprido). Definir versão "1.0 cliente real". | 3-5 dias | Alto — informação útil é o que ancora valor percebido |
| V.3 | **RLS audit · segurança end-to-end** · revisar todas as policies `pessoas`, `tasks`, `task_comments`, `clientes`, `projetos` pra garantir que cliente externo NUNCA vê dado fora do escopo dele. Casos a cobrir: cliente vê tasks de outro cliente · cliente vê comments internos (visivel_cliente=false) · cliente vê pessoas internas · cliente vê custos/horas internas. Documentar matriz role × tabela × CRUD. | 3-5 dias | Crítico — vazamento de dado entre clientes é gameover |
| V.4 | **Modal de task · review pra cliente externo** · cliente externo vê o mesmo modal do time interno hoje? Auditar campos visíveis: prazo/responsável/status/tags/checklist/tempo/anexos/histórico. Decidir o que esconder (custo/esforço/comments internos/historico de mudança de subetapa interna). Versão "modo cliente" do modal. | 3-5 dias | Alto — modal é onde cliente passa tempo |
| V.5 | **Forma de login · revisão UX** · hoje magic-link OTP por email + check em `pessoas.invited_at`. Avaliar: experiência do cliente recebendo o email · se o domínio do email vai pra spam · se a copy é clara · se tem fallback (botão "reenviar") · se a tela "verifica teu email ✉" tem CTA suficiente (ex: link mailto + suporte). Polir. Considerar adicionar "Lembrar de mim" / sessão mais longa pra cliente externo (hoje JWT 1h). | 2-3 dias | Médio-alto — primeira impressão técnica |
| V.6 | **Identidade visual no Portal** · cada cliente já tem `corPortal` + `corPortalTexto` configuráveis (admin define em Cadastros). Auditar: como fica o portal com cor escura vs clara · se a logomarca/Mark aperture aparece bem nas duas variantes · se há contraste suficiente em alerts/KPIs em ambos os temas. Considerar permitir logo do cliente (upload) no header do portal. | 2-3 dias | Médio — branding aumenta sensação de "feito pra mim" |
| V.7 | **Docs · Help + Onboarding pro cliente externo** · tour inicial específico pra cliente (não admin), com 3-4 telas: "este é seu portal · veja suas tasks · responda comentários · acompanhe entregas". Help modal com FAQ ("como reportar problema? quem é meu contato? como exportar?"). Hoje o onboarding existe mas é interno. | 2-3 dias | Médio — reduz suporte recorrente |
| V.8 | **Notificações pro cliente externo** · cliente recebe notif quando: comment do time é marcado visivel_cliente=true, status muda pra "aguardando cliente", task é concluída. Hoje o sino do header funciona mas só pra usuários internos via realtime. Habilitar pro role=cliente (RLS já cobre? validar). Considerar email digest semanal opcional. | 3-5 dias | Médio-alto — fecha o loop de comunicação |
| V.9 | **Auditoria de "modo cliente" end-to-end** · após V.1-V.8, fazer um walkthrough completo logado como `role=cliente`: navegar todas as telas acessíveis, tentar acessar URLs proibidas, validar permissões, validar copy, validar links quebrados, validar dark mode. Checklist final pré-launch. | 1-2 dias | Crítico — gate final |

**Pré-req:** mobile fechamento (A.15) ajuda mas não bloqueia — cliente externo provavelmente abre no desktop primeiro. Se mobile estiver decente, V atende.

**Quando atacar:** depois que tiver pelo menos UM cliente externo real definido (sabemos quem? qual cor? quais tasks?). Sem cliente concreto, V vira teoria.

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

Ciclo redesign DS fechou com dark mode. A.14 entregou só camada técnica
(dedup) — **a unificação visual real virou A.17, precisa plano novo**.
A.1, A.2, A.10, A.11 plenamente entregues. Frentes em aberto, em ordem sugerida:

1. **A.15 · Mobile fechamento** · Task modal full-screen mobile (Step 4) com estratégia anti-hidratação (dual-render via CSS, não matchMedia em render). Validar em dispositivos reais. Custo: 3-5 dias.
2. **A.13 · Triagem redesign UX-first** · ponto mais friccionado do fluxo diário; tem mock de referência do Felipe. TaskAlertRow vai ser introduzido aqui. Custo: 1-2 semanas.
3. **A.9 · Timesheet · entrada manual + permissões** · destrava retro-lançamento e fecha gap de controle. Custo: 3-5 dias.
4. **A.16 · Revisar bulk actions** · produtividade em operações repetitivas. Custo: 3-5 dias.
5. **A.17 · Card de task VISUAL** · replan do zero do que A.14 não cumpriu (consistência visual real entre Foco/Backlog/Kanban/Calendário/Triagem). Custo: 1-2 semanas.

Em paralelo (outra pessoa/sessão): **B.1 · `ai-suggest`** como primeira IA em prod — fecha o gap "diferenciação por IA" das promessas centrais (mais barato/seguro pra validar). Custo: ~1 semana.

Depois disso, escolher entre completar Bucket A (A.3+) ou avançar Bucket C (C.1+).
