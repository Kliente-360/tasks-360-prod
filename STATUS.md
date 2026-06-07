# STATUS.md — estado vivo do roadmap

> Fonte única de verdade do estado atual. Ler/atualizar todo começo de sessão relevante.
> `ROADMAP.md` = arquivo histórico imutável — não editar para refletir estado corrente.
>
> **Versão**: v1.03.117 · **Atualizado**: 07/06/2026 · branch `main`

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
- ✅ **A.4 · Triagem obrigatória pra IA** (v1.03.043-055) · campos `triada_em`/`triada_por`/`motivo_arquivamento` em tasks · `isPreTriagem(t)` filtra IA pré-triagem de todas as telas (Backlog/Foco/Kanban/Calendário/Dashboard/Briefing) · aba Triagem mostra Aceitar/Rejeitar com gate dos 5 campos + `RejectPopover` com motivos predefinidos · counter (bolinha vermelha) na aba Triagem do header com count total de pendências
- ✅ **Triagem · reformulação completa** (v1.03.056-059) · 5 campos críticos universais (cliente·projeto·resp·prazo·esforço) com gate por subetapa (prazo/esforço só ≥ escopo_definido); 6 pills de filtro com counts dinâmicos; inline edit em TODAS as tasks (não só IA); modo manual com botão Salvar; bulk + checkboxes removidos (triagem é one-by-one); inputs com largura fixa + ícones do FilterBar; **edição pendente** (não autosave) — só persiste ao clicar Aceitar/Salvar, fila estável durante edição; sort default = criadoEm DESC
- ✅ **Fix filtro Prazo no Kanban** (v1.03.056) · setter ignorava key 'prazo'; estendido `matchesPrazoFilter` pra suportar 'hoje' e 'sem' alinhando com FilterBar padrão
- ✅ **RLS Kliente 360 · interno owner** (v1.03.060-066) · admin vê tudo, interno vê tasks de cliente não-interno OU onde é responsável; novo helper `app_is_admin()`; FilterBar replicou o gate de Projeto desabilitado até selecionar Cliente; data-store frontend alinhado (filtro espelho antigo cortava a task antes do render)
- ✅ **NAV role-filter + Export gate + Onboarding** (v1.03.065) · NAV desktop estava vazando Briefing/Triagem/Cadastros pra interno e cliente; Export icon escondido pra não-admin; Onboarding no menu perfil disponível pra todo staff
- ✅ **Timer · subetapa em_definicao em diante** (v1.03.064) · seletor antes filtrava só status='andamento'; agora aceita rank ≥ 1 (em_definicao→em_implantacao), exclui backlog/bloqueado/concluido
- ✅ **Pessoa desativada some de dropdowns** (v1.03.068) · filtro `invited_at !== null` em todos os pontos que listam staff atribuível (FilterBar, Triagem, task modal, mention resolution)
- ✅ **Backlog/Kanban · chip Xd + frase nesta etapa unificados** (v1.03.069) · chip duplicado removido; nova frase única "X dias nesta etapa" baseada em subetapaEm (fonte unificada `etapaTempoDays`), com cor por threshold ≥7d âmbar / ≥14d vermelho, só de em_definicao em diante exceto concluído
- ✅ **Notifications · sistema completo** (v1.03.070-073) · fix lazy promise (`.then()` faltando), implementação de `cliente_comentou` + `cliente_respondeu` do Portal, NotifBell com 4 grupos (Todas · Menção · Updates em tasks · Updates do cliente), ícones bell/mention/activity/inbox, RLS apertada (SELECT só recipient, UPDATE só recipient, INSERT authenticated, DELETE bloqueado), click-outside fecha o sino
- ✅ **A.18 · Meu Foco redesign** (v1.03.075-077) · 6 contextos de atenção + checkbox "feito hoje" por task com persistência `localStorage` key `kliente360-foco-done-<YYYY-MM-DD>` (purge automático ao virar o dia) · linha única + motivo picklist + botões no topo; desktop ganhou mesma anatomia do mobile (inline-edit fluido); HOWTO + ONBOARDING atualizados (v1.03.078)

### Mobile · reestruturação completa (jun/2026 · v1.03.079 → v1.03.103)

Decisão de arquitetura consolidada — **não é bottom-tab-bar**, é layout específico por rota:

#### Arquitetura mobile definitiva
| Rota | Mobile | Desktop |
|---|---|---|
| `/resumo` | ✅ Carrossel (swipe ↔ Backlog) | — (não existe) |
| `/backlog` | ✅ BacklogMobilePanel | ✅ Tabela + FilterBar |
| `/foco`, `/kanban`, `/calendario`, `/triagem`, `/briefing`, `/dashboard`, `/timesheet`, `/cadastros` | — (desktop-only) | ✅ |
| `/portal` | 🔜 futuro | ✅ |

#### Entregues nesta sessão
- ✅ **MobileTabShell** · carrossel circular Resumo ↔ Backlog para admin mobile — DOM direto (zero React state durante swipe), 2 slots abs/rel, scroll reset no commit, `history.replaceState` pra URL sync. `SwipeNav` anterior removido.
- ✅ **Resumo executivo mobile** · `m-pagetitle` com data e count de alertas; tela termina onde terminam os componentes (altura natural, não estica com Backlog)
- ✅ **Backlog mobile (BacklogMobilePanel)** · filtro RLS por `currentPessoa` (mostra só tarefas do usuário), search `font-size:16px` (anti-zoom iOS), bottom sheet com 5 filtros (Cliente · Projeto · Status · Prioridade · Prazo) + botão de sort ↑↓ em cada campo, sort padrão `criadoEm DESC`
- ✅ **Filtro Projeto mobile** · sempre visível, desabilitado + opacidade 0.45 sem cliente selecionado
- ✅ **Botão Limpar fixo** · largura 52px pré-definida (não desloca a bar), ícone X + count com `visibility:hidden` quando vazio, vermelho ao ativar — espelho exato do `.fselect.clear` desktop. Layout: `[Buscar] [Filtro] [X n]`
- ✅ **PWA** · `start_url` → `/resumo` (abre no carrossel), `padding-top: env(safe-area-inset-top)` no `.hdr-v2` (header não cortado em iOS standalone), ícone 512px com `purpose: "any maskable"`, `theme-color` com variante dark `#111827`
- ✅ **Dead code removido** · `SwipeNav` (211 linhas), 3 blocos legacy `display:none` no Backlog (~265 linhas), state vars órfãs (`moreOpen`/`sortPanelOpen`/`filtersOpen`/`activeFiltersCount`), CSS `.m-tabbar`/`.m-tab` (tab bar que não existe mais), `.m-pill`/`.m-pills` (chips substituídos pelo clear button)

#### Entregues nesta sessão (mobile modal — jun/2026 · v1.03.104 → v1.03.115)
- ✅ **Modal de task mobile** · dual-render CSS `data-tab` (sem `matchMedia`), tabs **Detalhes** + **Conversa**, painel esquerdo simplificado, painel direito = conversa full
- ✅ **Detalhes simplificados** · grid 2 colunas: Cliente/Projeto · Status/Prazo · Previsto(h)/Realizado(h) + Descrição full-width. Campos desktop (Responsável, Prioridade, Complexidade, Checklist, Visível ao cliente, Bloqueado por, Escopo, Privacidade) ficam `hidden md:block`
- ✅ **Prazo mobile** · `type="text"` com `inputMode="numeric"`, exibe `dd/mm/aaaa` (evita o "12 de jun. de 2026" quebrando linha), converte pra ISO no `onBlur`
- ✅ **Privada** · checkbox `isCEO` ao final do formulário mobile (espelho da seção Privacidade desktop)
- ✅ **Header mobile limpo** · só título da task — chips (IA, prioridade, prazo, cliente, reaberta, arquivada) e `.tmodal-head-right` (autosave, copy, fechar ×) ocultados via CSS `display:none !important` no bloco `@media (max-width:767px)`
- ✅ **Profile menu** · ícone `sliders` no item Cadastros; link Backlog mobile-only acima de Cadastros

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
| ~~A.4~~ | ~~**Triagem obrigatória pra IA**~~ | ✅ Entregue v1.03.043-059 (ver ciclo redesign DS acima) |
| A.5 | **Saved views / filtros nomeados** · "Minhas atrasadas", "Aguardando cliente X". Depende de A.2. | 2-3 dias | Quick win UX alto impacto |
| A.6 | **Sticky thead Backlog** · cabeçalho fixo em scroll longo | 2-3 dias | Quick win UX |
| A.7 | **PDF Resumo Executivo** · consolidar Briefing+Dashboard em documento navegável | 1-2 semanas | Médio — reuniões offline |
| A.8 | **Workspaces · 3 pilares** (Salesforce · Dados · IA) · switcher topo + `workspace_id` em tabelas core + RLS por workspace | ⚠️ M-L · precisa spec própria | Estratégico — separação completa de ambientes |
| A.9 | **Timesheet · entrada manual + permissões** · permitir criar registros sem cronômetro (data/hora início + duração + task + nota); **excluir** só dono ou admin; **editar** desabilitado (registro é imutável após salvo — corrige criando novo + deletando o errado, mantém audit trail limpo) | 3-5 dias | Médio — desbloqueia retro-lançamento e fecha gap de controle |
| ~~A.10~~ | ~~**Cadastros · tabelas com colunas plenas**~~ | ✅ Entregue v1.03.022 + polish v1.03.023 (ver ciclo redesign DS acima) |
| ~~A.11~~ | ~~**Briefing × Dashboard · clarear papel**~~ | ✅ Entregue v1.03.041-042. Velocidade da operação migrou do Briefing pro Dashboard; Briefing fica editorial (alertas + clientes em atenção + conquistas); Dashboard concentra números (Velocidade + Entregas + Calendário + Carga). Card W-0 substituiu Lead time; meta throughput atualizada pra 25/sem; Ciclo e % no prazo ganharam delta vs 30d anteriores. |
| A.12 | **Dashboard × Portal cliente · padrão técnico** · auditar tecnologia/framework de cada um (parecem diferentes — Portal usa header verde escuro `--bg-portal`, Dashboard usa surface normal; estruturas de card divergem). Definir padrão único (componentes, tokens, hierarquia) e refazer ambos na versão final convergente. | 1-2 semanas | Alto — fecha o ciclo de DS nessas duas telas |
| ~~A.13~~ | ~~**Triagem · redesign UX-first**~~ | ✅ Entregue v1.03.043-059. Inline edit dos 5 campos + Aceitar/Rejeitar + RejectPopover + counter no header. "Cliente respondeu" continua coberto pelo NotifBell (separado por design). |
| A.14 (parcial) | **Card de task unificado** · 🟡 **só camada técnica entregue, sem mudança visual perceptível.** v1.03.032-038 dedupou JSX repetido em primitivas (`PriChip`/`TaskAvatar`/`PrazoLabel`/`TagIA`) e criou wrapper `<TaskCard>` com variantes `sm/md/lg/checkable/selected`. Mas as telas mantiveram seus markups específicos (Foco desktop = FocoCard próprio, Backlog desktop = `<table>`, Kanban = .kcard, Triagem = card-com-chips, Calendário = .kcard). Resultado: código mais limpo, **UI essencialmente idêntica ao que era antes**. | (já feito, parcial) | Médio (técnico, invisível ao usuário) |
| A.17 | **Card de task unificado · VISUAL** · **escopo redo**: A.14 entregou só dedup técnico. Falta a unificação visual real: cards iguais entre Foco desktop/mobile, Backlog mobile, Kanban, Triagem, Calendário detail. **Plano precisa ser refeito** — começar com auditoria visual real (prints lado-a-lado), decidir variante única por contexto, executar com mudança VISÍVEL em cada PR (não dedup invisível como A.14). Não tocar sem plano novo aprovado. | 1-2 semanas | Alto — entrega o que A.14 prometeu mas não cumpriu |
| ~~A.18~~ | ~~**Meu foco · redesign UX-first**~~ | ✅ Entregue v1.03.075-077 (ver Marcos concluídos acima) |
| ~~A.15~~ | ~~**Mobile · modal de task**~~ | ✅ Entregue v1.03.104-115 (ver sessão mobile modal acima). Modal full-screen mobile com 2 tabs, grid 2-col, prazo dd/mm/aaaa, Privada para CEO, header limpo. |
| A.16 | **Revisar bulk actions** · auditar BulkBar (seleção múltipla no Backlog) — UX da seleção, ações disponíveis (atribuir cliente/projeto/pessoa/prazo/prioridade/esforço, arquivar, excluir), feedback visual (sticky bar com contador), comportamento mobile (não aparece hoje). Decidir: manter no Backlog desktop, levar pro Kanban também, adicionar atalhos teclado (ESC limpa seleção, Cmd+A seleciona tudo filtrado), confirmações pra ações destrutivas. | 3-5 dias | Médio — produtividade em operações repetitivas |
| ~~A.19~~ | ~~**Cadastros · 3 abas + modais**~~ | ✅ Entregue. Desktop: modais CRUD completos desde v1.03.002. Mobile: listas row-click + modais simplificados (nome/cor/cliente/papel) em `a830a5e`. |

### Bucket V · Visão cliente (pre-launch hardening)

**Objetivo macro:** abrir o produto pro **primeiro cliente em definitivo** com identidade, segurança e UX dignas. Hoje o Portal cliente existe e funciona pra clientes externos da Kliente 360, mas várias áreas precisam de polish/auditoria antes de soltar pra cliente "real" (não-interno).

Diferente dos buckets A/B/C que são features incrementais, V é **um lote coeso** — escopo é "tudo que um cliente novo encosta". Vale executar como um sprint focado de 1-2 semanas com Felipe validando cada item.

| # | Item | Esforço | Impacto |
|---|---|---|---|
| V.1 | **Portal cliente · revisão completa de UX** · auditar storytelling (header verde + KPIs + ritmo de entregas + distribuição + lead time + lista), decidir o que fica/sai pra cliente externo (vs admin trocando contexto). Portal mobile: avaliar port fiel (hoje só esconde storytelling). | 3-5 dias | Alto — é a vitrine do produto pro cliente |
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
| B.2 | **`ai-weekly-summary`** · resumo executivo da semana, cron sábado | Sonnet · ~R$0,10/exec semanal | 4-5 dias | ⭐⭐ Aba "Insights". Sócio lê portfólio em 5min. |
| B.3 | **Resumir thread de task** · botão "TL;DR" no modal | Sonnet · ~R$0,05/exec sob demanda | ~1 dia | Quick win — primeira IA low-risk/high-value visível ao usuário |
| B.4 | **Auto-triage com IA** · classifica tasks criadas por IA antes da Triagem | Haiku · ~R$0,02/exec | M (depende de A.3) | Combina com `ai-suggest`. Limpa fila da Triagem. |
| B.5 | **Aba Foco com IA leve** · resumo do dia + 3 tasks priorizadas | Haiku · ~R$0,02/exec por usuário/dia | M | Personalização real do Meu foco |
| B.6 | **`ai-chat` com tool use** · chat com backlog via ⌘K (busca + filtros + agregações) | Sonnet · custo variável | L (precisa cuidado com prompt injection) | Diferenciador real, mas adiar até B.2+B.3 validados em prod |
| B.7 | **`ai-risk-scanner`** · banner "🚨 N sinais hoje" no Dashboard (cron diário) — movido de C.1 | Sonnet · ~R$0,30/dia | ~1 semana | ⭐ Premium-perception alta |
| B.8 | **Cliente em fricção via NLP** · análise de comments públicos pra detectar tom — movido de C.6 | Sonnet · custo variável | M | Sinal precoce de churn, complementa C.5 |

### Bucket C · Heurísticas Analytics (puro SQL/agregação, sem LLM)

Detecção de padrões via dados locais. **Output é insight/score/alerta** consumido em Dashboard ou Briefing. Nenhum item invoca LLM.

#### ✅ Mecanismos implementados em `src/lib/analytics.ts` (v1.03.116–117)

Todas as funções puras abaixo estão prontas, testadas (64 testes) e disponíveis para consumo. Nenhuma ainda aparece na UI.

| Função | Heurística | O que computa |
|---|---|---|
| `computeCapacidade` | C.2 · Capacidade prevista | `semanas_estouro = backlog / throughput_4w`, byPessoa. Níveis: ok ≤4w · atencao ≤8w · critico >8w |
| `computeSkillMismatches` | C.3 · Skill mismatch | Tasks abertas onde `escopo` ∩ `pessoa.skills` = ∅ |
| `computeSenioridadeAlerts` | C.4 · Senioridade malalocada | `risco_qualidade` (alta+junior) · `desperdicio` (baixa+senior) |
| `computeChurnRisk` | C.5 · Churn risk | Score 0-100 por cliente externo: bloqueada >14d (+25) · sem entrega >30d (+30) · SLA breach >40% (+25) · em_definicao >21d (+20) |
| `computeBottlenecks` | C.7 · Bottleneck por sub-etapa | Dias mediana/p75/p90 em cada subetapa corrente |
| `computeSLABreach` | C.8 · SLA breach rate | % tasks concluídas fora do prazo, agrupado por cliente/projeto/pessoa |

#### 🔜 Pendente

| # | Item | Esforço | Impacto |
|---|---|---|---|
| C.10 | **Publicar heurísticas na UI** · decidir onde cada função aparece (Dashboard? Briefing? nova aba Analytics?), desenhar cards/widgets por heurística, ligar aos dados do DataProvider | 1-2 semanas | Alto — transforma os KPIs em valor percebido |

---

## ❌ Descontinuados (não repropor sem novo input)

Tags · Tipo de trabalho · Dependências UI · Templates de projeto · WhatsApp digest · Slack integration · iCal feed · Triage inbox Linear-style · Importação CSV · File/Protocol/Share handlers · Multi-workspace externo · Faturamento NFe · API pública · Aba Adoção · Email digest semanal · Notif digest hourly · Sentry · PostHog · Bottom tab bar mobile (substituída por carrossel MobileTabShell) · **B.1 `ai-suggest`** (sobrepõe B.4 auto-triage — descartado) · **C.9 Margem por hora vs ticket** (precisa custo/h da pessoa — dado não existe ainda)

---

## 📜 Promessas centrais

| Promessa | Status |
|---|---|
| Visibilidade gerencial (Dashboard + Briefing) | ✅ Entregue mai/2026 |
| Colaboração viva (realtime) | ✅ Ativo desde cutover jun/2026 |
| Portal cliente | ✅ Entregue jun/2026 |
| Time tracking (cronômetro) | ✅ Entregue jun/2026 |
| Stack homogêneo e enxuto | ✅ Auditado e limpo (v1.02.226–229) |
| Mobile admin experience | ✅ Entregue jun/2026 (v1.03.079-115) — carrossel + backlog + modal de task completo. |
| Diferenciação por IA | ❌ Zero em prod — atacar via Bucket B |
| Analytics avançado | ⚠️ H1–H15 + C.2/C.3/C.4/C.5/C.7/C.8 implementados em `analytics.ts` — falta publicar na UI (C.10) |

---

## 🎯 NEXT · ordem definida (jun/2026)

**Onda 1 · Design coeso** (~1-2 semanas)
1. **A.17** Card de task · VISUAL (replan + execução)

**Onda 2 · Closing loops** (~10-20 dias)
3. **A.12** Dashboard × Portal · padrão técnico convergente
4. **A.16** Revisar bulk actions (BulkBar)

**Onda 3 · Quick wins** (~10 dias)
5. **A.9** Timesheet · entrada manual + permissões
6. **C.3** Skill mismatch (heurística pura)

Items NÃO no NEXT (revisitar depois): A.3 Push · A.5 Saved views · A.6 Sticky thead · A.7 PDF · A.8 Workspaces · todo o Bucket V (Visão cliente — depende de ter cliente real) · todo o Bucket B (IA — paralela) · C.10 (publicar heurísticas na UI).

---

## Próximo passo imediato

**A.17 · Card de task · VISUAL** — replan + execução. Auditoria visual real antes de tocar código.
