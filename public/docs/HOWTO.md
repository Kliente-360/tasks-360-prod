# tasks 360 — manual do usuário

> **Como usar a ferramenta no dia a dia.** Atualizado a cada release com novas funcionalidades ou mudanças de comportamento.
>
> **Dentro do app**: clique no botão **?** no topo (ou ⌘K → "Manual") pra abrir esse documento renderizado bonito, com índice navegável.
>
> Última atualização: jun/2026 · v1.02.229 · pós-cutover. Cronômetro start/stop + Timesheet, Portal cliente v2 ativo, Briefing colapsável + conquistas W-1, disciplina de comentário, escopo + skills, bloqueado exige justificativa, badge PWA, tasks criadas por IA (chip 🤖 + filtros), integração Salesforce + Cowork.

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Abas do app](#abas-do-app) — Notificações · Meu foco · Briefing · Triagem · Backlog · Kanban · Calendário · Dashboard · Portal · Timesheet · Cadastros
3. [Modelo de uma tarefa](#modelo-de-uma-tarefa)
4. [Modal de uma tarefa (4 abas)](#modal-de-uma-tarefa-4-abas)
5. [Criando, editando e movendo tarefas](#criando-editando-e-movendo-tarefas)
6. [Filtros e busca](#filtros-e-busca)
7. [Atalhos de teclado e command palette](#atalhos-de-teclado-e-command-palette)
8. [Bulk actions na tabela](#bulk-actions-na-tabela)
9. [Comentários](#comentários)
10. [Cronômetro e Timesheet](#cronômetro-e-timesheet)
11. [Checklist da tarefa](#checklist-da-tarefa)
12. [Anexos (imagens via paste)](#anexos-imagens-via-paste)
13. [Tasks criadas por IA](#tasks-criadas-por-ia)
14. [Exportar (CSV)](#exportar-csv)
15. [Login](#login)
16. [Tema, mobile, PWA](#tema-mobile-pwa)
17. [Glossário](#glossário)

---

## Visão geral

A **tasks 360** é a ferramenta de gestão executiva de backlog da Kliente 360. Tem uma tela só com várias abas; as decisões são opinativas (esforço em horas, prioridade P0–P3, etapas fixas), sem campo customizável.

Quem você é determina como usa:

- **Sócio / liderança** → começa pelo **Briefing** (resumo de 1 min com ação) e pelo **Dashboard** (KPIs + charts).
- **PM / consultor** → começa pelo **Meu foco** (urgências do dia) e usa o **Backlog** + **Kanban** pra operar.
- **Time externo (Salesforce)** → não precisa abrir o app; o que vier do SF aparece com badge "SF".

---

## Abas do app

Da esquerda pra direita no topo:

### Notificações

Sino 🔔 no header (ao lado do avatar) com badge vermelho mostrando o número de notificações não lidas. Click abre painel com últimas 50.

Tipos disparados automaticamente:
- **Mention**: alguém te menciona em um comentário (`@SeuNome`)
- **Atribuição**: você foi atribuído como responsável de uma task
- **Comentário em task sua**: outra pessoa comentou em uma task que você é responsável
- **Cliente respondeu**: cliente externo comentou ou marcou "Já respondi" em uma task que é sua

Click numa notificação marca como lida e abre a task referenciada. Botão "marcar tudo lido" pra zerar o badge.

> Implementado in-app via Realtime — sem email push. Quando o app está aberto, notificação chega instantaneamente com toast leve. Quando fechado, aparece ao reabrir.

### Mencionar pessoa em comentário

No campo de comentário (modal de edição da tarefa), botão **"@ mencionar"** abre dropdown com filtragem de pessoas internas. Click na pessoa insere `@Primeiro_nome` no texto. Quando o comentário é exibido, qualquer `@nome` que case com pessoa cadastrada vira chip verde destacado.

> Cliente externo não aparece no dropdown (pra evitar mention acidental). Mentions de pessoas que não existem ficam como texto normal.

### Card de tarefa (componente único)

O mesmo card visual aparece no **Backlog mobile**, **Meu foco**, **Calendário (dia selecionado)** e **Kanban operacional**. Mudanças nele afetam todos os 4 lugares — comentários cruzados nos templates marcam isso. Estrutura: título + prioridade (topo), cliente · projeto, responsável + complexidade + prazo, status + aging badge.

### Meu foco

Painel curado pra começar o dia. Mostra automaticamente o foco da pessoa logada. Card "Seu dia" no topo com narrativa + contagem das 6 seções. Pill **P0/P1** no canto direito do header filtra (AND) dentro de todas as seções.

**6 seções colapsáveis** (todas abertas por default · cada uma com counter de pendentes):

1. **Atrasadas** — prazo < hoje, exclui status concluído/bloqueado e subetapa `em_homologacao` (o time não tem ação direta nessas)
2. **Pra hoje** — prazo = hoje, não atrasada
3. **Bloqueadas** — status = `bloqueado`
4. **Sem comentário (24h)** — task em andamento sem comment do próprio responsável nas últimas 24h (ou nunca)
5. **Sem esforço** — esforço vazio, a partir de `escopo_definido` (mesmo gate da Triagem)
6. **Sem horas realizadas** — task em andamento com `tempoRealHoras` zerado

> Uma mesma task pode aparecer em mais de uma seção (atrasada que também está sem comentário, por exemplo). Atrasadas e Pra hoje são naturalmente exclusivas.

**Card largo padrão** (mesmo da Triagem) com **6 inputs inline em UMA linha**: prazo · esforço · horas · status (subetapa) · motivo (picklist, só ativo se subetapa = bloqueado) · comentário rápido. Não é autosave: campos viram pendentes até clicar **Salvar**. Botão só habilita quando algo mudou (gate de dirty + requeridos por seção).

- **Resolver / Resolvido** — botão no canto superior direito do card marca como tratado **só hoje** (não persiste em DB). Risca o título, opaca o card, decrementa a bolinha vermelha da aba Foco. **Zera automaticamente ao virar a data.**
- O check é por seção: marcar uma task como Resolvida em "Sem horas" não afeta sua aparição em "Bloqueadas". Cada contexto tem seu próprio risco.
- Click na **área do título/meta** do card abre o modal completo da task.

**Bolinha vermelha na aba Foco** (header desktop + mobile) — soma das 5 seções computáveis sem query async (atrasadas + hoje + bloqueadas + sem esforço + sem horas), descontados os marcados como Resolvido hoje. Sem comentário não entra na bolinha (precisa query) mas aparece na seção própria.

### Briefing executivo

Visível apenas para `admin`. Aba de **decisão executiva** — responde 4 perguntas do dia-a-dia do CEO/sócios sem precisar abrir tabela:

1. **Clientes pra conversar hoje** — cards com nome + motivo + ação sugerida (renegociar escopo, cobrar resposta, alinhar prazo). Click no card filtra o Backlog pelo cliente.
2. **Pessoas pra conversar hoje** — sobrecarga / pressão de capacidade com ação sugerida (redistribuir, aliviar).
3. **Tendência da operação** — 4 KPIs com Δ vs período anterior (throughput, lead time, % atrasadas, capacidade média) + narrativa textual sintética.
4. **Capacidade vs demanda** — utilização do time e recomendação (contratar / manter / cortar).

Headline no topo muda com o estado real: "3 clientes em risco · 2 pessoas precisando de conversa" ou "Nada crítico. Operação fluindo."

### Triagem

Visível apenas para `admin`. Fila de tarefas que ainda **não estão prontas pra serem trabalhadas** — faltam campos críticos. Triagem é **one-by-one** (sem bulk): cada card é tratado individualmente.

**Critérios de entrada na fila** (a task aparece se cair em qualquer um):
- Sem **cliente** · sempre obrigatório
- Sem **projeto** · sempre obrigatório
- Sem **responsável** · sempre obrigatório
- Sem **prazo** · só a partir da subetapa `escopo_definido` (rank 3)
- Sem **esforço** · só a partir da subetapa `escopo_definido`
- **IA pré-triagem** · task criada por automação (`criado_por_ia = true`) que ainda não foi aceita por um humano (campo `triada_em` nulo)

**6 pills de filtro** no topo (combináveis · AND): sem cliente · sem projeto · sem resp. · sem prazo · sem esforço · 🤖 criadas por IA. Cada chip mostra count dinâmico do que cairia ao ativar mantendo os outros.

**Sort**: IA pré-triagem primeiro (gate prioritário · borda esquerda verde no card), depois por data de criação **descendente** (mais recentes no topo).

**Card de triagem**: anatomia larga (mesmo padrão usado depois no Meu Foco) com **5 inputs inline padronizados** (largura fixa · ícones FilterBar) — cliente · projeto · responsável · prazo · esforço.

- **Edição pendente** — campos NÃO salvam a cada digitada. A row não muda de posição na fila enquanto você está editando, e não some prematuramente ao preencher o último campo. Persiste apenas ao clicar o botão de ação.
- **Aceitar** (tasks IA) · grava os 5 campos + marca `triada_em` + `triada_por`. Task entra no backlog normal.
- **Rejeitar** (tasks IA) · abre popover com motivos predefinidos (Duplicada · Fora de escopo · Spam · Sem contexto · Não acionável · ou texto livre). Marca `triada_em` + arquiva com `motivo_arquivamento`.
- **Salvar** (tasks manuais que caíram na fila por field-missing) · grava os 5 campos. Task sai da fila quando os critérios deixam de bater.
- Gate dos botões: só habilita com todos os requeridos do contexto preenchidos.

**Counter na aba Triagem** (header desktop) — bolinha vermelha com total da fila.

> Badge `triar` (âmbar) aparece inline em qualquer task que precise (Backlog, Kanban, Calendário) — assim o triador identifica de qualquer view. Foco mostra a mesma task se ela for sua e cair em algum dos critérios do Foco.

### Backlog

Tabela mestre. Cabeçalho ordenável por qualquer coluna (clique). Colunas: Tarefa · Cliente · Projeto · Responsável · Pri · Hrs · Cmplx · Prazo · Status. Linha clicada abre o detalhe.

- Cada linha tem uma faixa colorida na borda esquerda indicando o grupo macro de status
- Atrasadas em vermelho
- Aging badge em laranja/vermelho quando uma tarefa está parada além do limite saudável
- Chip `🤖 IA` antes do título marca tasks criadas por automação de IA (ver [Tasks criadas por IA](#tasks-criadas-por-ia))
- **Agrupar por** (menu ⋯ no topo da tabela): default sem agrupamento (lista plana). Opções: Responsável · Cliente · Projeto · Status · Etapa · Prioridade · Complexidade. Cada grupo vira um header colapsável (clique pra expandir/recolher) com contagem e total de horas.
- **Ordenar**: no desktop, click no cabeçalho da coluna alterna asc/desc/none. No mobile, botão "Ordenar: [chave] ↑↓" abre painel com 10 opções; click na mesma chave alterna direção, click em outra ativa em ascendente. Etapa segue ordem natural do fluxo, não alfabética.
- **Ordem manual**: botão "≡ ordem manual" → arraste linhas pra reordenar (desabilitado quando há agrupamento; só desktop)
- **Filtros**: cliente, projeto, pessoa, status, prioridade, complexidade (ver [Filtros](#filtros-e-busca)). No menu ⋯ também há "mostrar arquivadas" e os toggles "somente criadas por 🤖 IA" / "somente criadas por humanos".
- **Bulk actions**: checkbox por linha (ver [Bulk actions](#bulk-actions-na-tabela))
- **Pagination**: cada grupo mostra até 100 rows por padrão; botão **"mostrando X de Y · carregar mais"** no fim da lista pra revelar o restante. Mantém o render leve mesmo com centenas de tasks.

### Kanban

Duas visões via toggle no topo (no **desktop**). No **mobile** só a visão executiva aparece (a operacional, com 11 colunas, é ruim em tela estreita).

- **Operacional** (default desktop) — 11 colunas com sub-etapas em scroll horizontal. Mover entre colunas via drag-and-drop ou via o select no rodapé do card. Cada coluna tem `+ adicionar` pra criar tarefa rápido.
- **Executiva** (única no mobile) — 4 colunas macro (Backlog, Em andamento, Bloqueado, Concluído), só leitura. O sub-status atual aparece em cada card.

A faixa colorida no topo de cada coluna operacional sinaliza o grupo macro: verde = andamento, vermelho = bloqueado, cinza = backlog/concluído.

> No mobile, pra mover de etapa: abra a tarefa (toque no card) e mude o campo "Etapa" no formulário.

### Calendário

Grid mensal. Cada dia mostra as tarefas com prazo nele. No desktop, chips com título; no mobile, dots coloridos.

- **Click num dia** com tarefas → seleciona o dia (destaque verde escuro) e mostra **cards das tarefas daquele prazo abaixo do calendário**. Cards são idênticos aos do kanban (com select pra mover etapa direto dali), ordenados por prioridade. Click no card abre a tarefa.
- **Click no mesmo dia de novo** → desseleciona e fecha a tabela.
- Mudar de mês limpa a seleção automaticamente.
- Verde = no prazo · Vermelho = atrasada · Cinza riscado = concluída
- Hoje destacado em borda verde
- Header mostra navegação (‹ hoje ›). Contagens vão pra legenda inferior.

### Dashboard

Banner de heurísticas no topo (alertas determinísticos de risco) + KPIs hero (em andamento, backlog, bloqueadas, atrasadas) + entregas 5 semanas + calendário + velocidade (throughput 7d/30d, lead time, cycle time + bar 8 semanas) + **lead time médio por cliente** (90d) + **volume por cliente** + **capacidade por pessoa** (% da capacidade semanal alocada, vermelho ≥100%) + **saúde por projeto** (semáforo verde/âmbar/vermelho) + **aging do backlog** (faixas 0-7/8-30/30-60/60+ por status) + listas de atrasadas, bloqueadas e aguardando cliente.

Todos os gráficos compartilham o `chartTheme()` central — paleta semântica (brand/danger/warn/info/neutral), grid, fontes e tooltip padronizados.

Filtros de cliente e responsável afetam tudo.

### Cadastros

Três sub-abas: Clientes · Projetos · Pessoas. Cadastre antes de criar tarefas que dependam.

Em **Clientes**, o botão "editar" abre modal com:
- **Nome**
- **Tier** (`estratégico` / `potencial` / `descoberta`) — alimenta a heurística "atrasada em cliente estratégico" e aparece como badge na listagem.
- **Domínios de email** — lista de chips (ex: `bodytech.com.br`). Usado por automações (Cowork lendo notas de reunião) pra identificar o cliente pelos participantes. Digite e tecle Enter/vírgula/espaço pra adicionar. Clientes ativos sem domínio ganham um chip âmbar **"sem domínio"** na lista, e o page-bar mostra quantos faltam configurar.
- Clientes do tipo **interno** (bucket de gestão, `eh_interno`) não mostram tier nem domínios — não entram em heurísticas, dashboards de cliente nem automações.

**Arquivar** esconde o cliente dos selects e da Saúde por projeto sem deletar (badge "arquivado" + linha esmaecida). Toggle "incluir arquivados" no topo mostra de volta.

Em **Projetos**, o botão "editar" abre modal com nome, cliente, **tipo** (`sustentação` / `projeto` / `discovery`) e atributos de **SLA + orçamento** (resposta em horas, entrega em dias, orçamento total em horas). SLA de entrega aciona a heurística "SLA iminente" entre 80% e 120% do prazo. Os atributos aparecem como badges discretas na listagem. **Arquivar** funciona igual ao de cliente — esconde do radar, sem deletar.

Em **Pessoas**, o botão "editar" abre modal com nome, email, perfil (Admin / Time Kliente 360 / Cliente externo) e — quando perfil for "Cliente externo" — o cliente vinculado. Pra time interno: capacidade semanal, skills e **senioridade** (júnior/pleno/sênior/lead). Júnior + complexidade alta vira alerta na heurística.

Tasks têm contador `reopenCount` automático (incrementado por trigger SQL quando voltam de "concluído" pra qualquer outro status). Aparece como badge "reaberta Nx" no header do modal. Tarefas reabertas 2+ vezes viram alerta na heurística.

Tasks também ganham 3 atributos extras (Onda C):
- **Escopo** (`escopo`, multi-valor) — classificação técnica da task: `SF Admin`, `SF Clouds`, `IA/Conversacional`, etc. Usado pra match com `skills` da pessoa no dropdown de responsável.
- **Tempo real (horas)** — opcional, manual ou via cronômetro (ver [Cronômetro e Timesheet](#cronômetro-e-timesheet)). Se >1.5x do esforço estimado, vira alerta.

Botões de acesso variam por perfil:
- **Cliente externo** (login via magic link): "convidar" / "reenviar link" / "inativar"
- **Time interno / Admin** (login via Google): "ativar" / "inativar" — sem reenviar link, porque o login não depende de email; basta a pessoa estar `ativa` (`invited_at` preenchido) pra entrar com Google.

Badges:
- *acesso ativo* — pessoa já logou pelo menos uma vez
- *convidada · aguardando 1º login* — cliente externo recebeu o link mas ainda não usou
- *ativa · ainda não logou* — interno habilitado mas que ainda não entrou
- *sem convite* / *inativa* — sem permissão atual de acesso

### Portal cliente

Aba dedicada para o cliente externo. Layout simples com 4 cards (Aguardando você, Em andamento, Próximas 14d, Entregues 30d) sem jargão de PM. Click numa tarefa abre detalhe simplificado com linha do tempo humanizada, comentários públicos e caixa de novo comentário. Quando uma tarefa está bloqueada por aguardar resposta do cliente, aparece o botão **"Já respondi"** que cria um comentário marcado e sinaliza ao time pra triar.

- *Admin/Interno*: aparece um seletor "visualizar como cliente" — escolhe qual cliente simular. Persistido no localStorage.
- *Cliente externo logado*: seletor some, ele só vê o próprio cliente (vinculado via `pessoas.cliente_id`). Tab "Portal" é a única visível.

### Timesheet

Aba (admin/interno · desktop) que mostra o histórico de registros do **cronômetro**. Cada linha é uma sessão de trabalho (`time_entries`): task, início, fim, duração, nota opcional.

- *Admin*: vê todos os registros, com filtro "somente o meu" e seletor de pessoa.
- *Interno*: vê só os próprios registros.
- Click numa linha abre o modal da task. Lixeira deleta o registro (sem confirmação — undo é recriar).

Detalhes de uso do cronômetro em si na seção [Cronômetro e Timesheet](#cronômetro-e-timesheet).

---

## Perfis e permissões

3 roles em `pessoas`:

| Role | Vê | Limita |
|---|---|---|
| **admin** | Tudo (todas abas + Cadastros) | — |
| **interno** | Foco · Backlog · Kanban · Calendário · Dashboard · Portal cliente | Sem Cadastros. **Não pode excluir tasks.** |
| **cliente** | Apenas Portal cliente, escopado ao próprio cliente | Não cria task, não edita, não move etapa. |

> Enquanto auth não está ativo, todo usuário é `admin` por default e o seletor do Portal permite simular qualquer cliente. Quando auth voltar, o role é derivado automaticamente da pessoa logada.

---

## Heurísticas (sinais de risco)

Banner no topo do **Dashboard** mostra alertas determinísticos (sem IA) baseados em atributos de task, pessoa, cliente e projeto. Severidade `alta` (vermelho) ou `media` (âmbar). **14 heurísticas ativas:**

**Onda A — risco operacional** (4):
1. **Tarefa grande sem início** com prazo a ≤10 dias
2. **Cliente estratégico com atrasada(s)**
3. **Bloqueio aguardando cliente há +5 dias**
4. **SLA contratado quase vencido** (projetos com `sla_entrega_dias`)

**Onda B — qualidade** (2):
5. **Júnior + complexidade alta** — task de alta complexidade atribuída a pessoa júnior
6. **Reaberturas crônicas** — task com `reopen_count ≥ 2`

**Onda C — execução** (1):
7. **Estimativa furada** — `tempo_real_horas > 1.5x esforço`

**Onda D — capacidade semanal** (5):
8. **Pessoa sobrecarregada na semana** — horas alocadas na semana > capacidade
9. **Sustentação estourando** — projeto de sustentação acima do orçamento semanal
10. **Sustentação ociosa** — sustentação muito abaixo do contratado por semanas seguidas
11. **Projeto estourando escopo** — projeto fechado acima do orçamento total
12. **Projeto em risco de estouro** — projeto fechado próximo do limite de orçamento

**Operacional** (1):
13. **Triagem represada** — N tasks precisando de triagem (sem responsável / cliente / prazo / esforço em etapa onde aplica). Alta se ≥10, média caso contrário.

> A antiga heurística "sobrecarga acumulada" (Onda A) foi aposentada na Onda D — mascarava sazonalidade. A versão semanal (#9) a substitui.

> Cálculo em single-pass + memo: o conjunto inteiro de heurísticas é recomputado só quando tasks/pessoas/clientes/projetos mudam relevantemente.

---

## Modelo de uma tarefa

Campos:

| Campo | O que é |
|---|---|
| **Título** | Obrigatório. Curto e claro. |
| **Descrição** | Opcional. No mobile, é escondida na tabela do Backlog pra manter linhas uniformes. |
| **Cliente** | Quem paga. Resolve cascata pra projetos. |
| **Projeto** | Filhote do cliente. |
| **Responsável** | Pessoa única. Pode ficar vazio (mas aparece como sinal de risco). |
| **Prioridade** | P0 (urgente) · P1 (alta) · P2 (normal) · P3 (baixa). |
| **Esforço** | Horas estimadas. Decimal aceito. |
| **Complexidade** | Alta · Média · Baixa. Aparece como chip com mini-barras na tabela do Backlog. |
| **Prazo** | Data. Se passou e o status não é `concluido` → vira atrasada. |
| **Etapa** | Sub-etapa (nível 2). Macro é derivada automaticamente: |
|   | • Backlog → backlog · priorizado · em definição · escopo definido |
|   | • Em andamento → em desenvolvimento · em homologação · em revisão · pronto p/ produção · em implantação |
|   | • Bloqueado → bloqueado |
|   | • Concluído → concluído |
| **Escopo** | Array de skills técnicas da task (`SF Admin`, `SF Clouds`, `IA/Conversacional`, etc). Combina com `skills` da pessoa pra destaque no dropdown de responsável. |
| **Checklist** | Lista de mini-tasks (`{ id, body, done }[]`). Colapsável no modal, contador done/total no header. Detalhes em [Checklist](#checklist-da-tarefa). |
| **Visível ao cliente** | Boolean. Se `true`, task aparece no Portal cliente. Default `true` — exclua selecionando "—" não. |
| **Anexos** | Imagens coladas via ⌘V/Ctrl+V (PNG/JPG/WebP até 2MB). Persistidas em Storage. Detalhes em [Anexos](#anexos-imagens-via-paste). |
| **Reaberturas** | Contador automático (`reopen_count`) incrementado por trigger SQL quando task volta de `concluido`. Badge "reaberta Nx" no header do modal. |

---

## Modal de uma tarefa (4 abas)

Quando você clica numa task, abre o **modal de detalhe** — header slate `#1f2937` + corpo em dois painéis (no desktop) ou 3 abas (no mobile + 4ª de anexos).

### Header
Da esquerda pra direita: **título** (editável inline) · **prioridade** (chip colorido) · **prazo** (chip âmbar com data) · **cliente** (chip cinza). À direita: indicador de **autosave** (debounce 800ms) e botão de fechar.

### Painel esquerdo (mobile: aba "Detalhes")

Ordem das seções, top→down:
1. **Atribuição** — cliente · projeto · responsável · prioridade (grid 2×2)
2. **Descrição** — textarea (suporta markdown render leve)
3. **Checklist** — colapsável; default fechado. Abre auto se a task já tem itens. Detalhes em [Checklist](#checklist-da-tarefa).
4. **Esforço** — complexidade · prazo · estimado (h) · realizado (h)
5. **Metadata (sem título)** — Etapa (sub) · Visível ao cliente. Campo "Bloqueado por" aparece quando etapa = `bloqueado`.

> Macro é derivada da sub automaticamente. Subetapa "concluído" leva pra macro `concluido`, etc.

### Painel direito (mobile: abas Conversa · Anexos · Histórico)

Três abas com contador:
- **Conversa** — comentários + composer. Detalhes em [Comentários](#comentários).
- **Anexos** — grid de imagens coladas. Detalhes em [Anexos](#anexos-imagens-via-paste).
- **Histórico** — timeline unificada de mudanças de status + campos.

### Footer

4 botões: arquivar · excluir (admin only) · fechar · salvar.

> **Autosave**: enquanto você edita campos de uma task existente, ela salva sozinha após 800ms de inatividade — indicador no header mostra dirty / saving / saved. O botão "salvar" continua existindo como fallback e também fecha o modal.

### ESC encadeado

ESC vai fechando do mais interno pro mais externo:
1. Picker de @mention aberto → fecha picker
2. Linha de checklist vazia em foco → remove a linha
3. Linha de checklist com conteúdo em foco → blura (cancela edição da linha)
4. Editando comentário (textarea aberto) → cancela
5. Reply em foco → cancela reply
6. Lightbox de anexo aberto → fecha lightbox
7. Nada acima → fecha o modal (autosave já garantiu a persistência)

---

## Criando, editando e movendo tarefas

### Criar tarefa completa

- Botão **+ Nova tarefa** no canto superior direito (ou atalho `n`).
- Modal abre com todos os campos. Preencha o título no mínimo. Salve.

### Quick add (kanban operacional)

- Botão **+ adicionar** no topo de cada coluna sub-etapa.
- Digita só o título → Enter cria com defaults (P2, 4h, complexidade média, sem cliente/projeto/responsável). Editável depois.
- Após criar, o input continua aberto pra captura contínua. Esc fecha.

### Editar

- Clique numa linha da tabela, num card do kanban, num chip do calendário ou em qualquer item de Meu foco.
- Modal de detalhe abre com todos os campos editáveis + comentários + histórico.

### Mover de etapa

- **Kanban operacional**: arraste o card para outra coluna *ou* use o select no rodapé do card.
- **Backlog**: clique na linha, mude o campo "Etapa" no modal.
- **Bulk**: selecione várias linhas no Backlog → barra flutuante → "mover etapa".

Quando a etapa muda atravessando macros (ex: backlog → em desenvolvimento), o histórico de status registra a transição. Mudar dentro da mesma macro só atualiza o aging granular.

### Reordenar manualmente (Backlog)

1. Clique em **≡ ordem manual** no topo direito do Backlog.
2. Linhas viram arrastáveis. Solte na posição desejada.
3. Persistência via float (sem renumeração periódica). Para sair, clique em **✓ ordem manual** de novo.

### Excluir

- No modal de edição, botão **excluir tarefa** (vermelho). Confirma antes de apagar.
- Em massa: bulk action no Backlog.

---

## Filtros e busca

### Filtros do Backlog

- **Busca por título** (campo livre)
- **Cliente · Projeto · Pessoa · Pri · Cmplx · Status** (selects, na mesma ordem das colunas da tabela)
- Filtros viram URL: pode compartilhar o link e o destinatário vê a mesma visão.
- Botão **✕ limpar filtros** com contador aparece quando há ao menos um filtro ativo.

### Default do filtro de status

- Padrão é **"Abertas (sem concluídas)"** — concluídas ficam fora do dia a dia.
- Para ver concluídas, troque pra **"Todos os status"** ou **"Concluído"**.

### Filtros do Kanban / Calendário / Dashboard

Cliente e responsável aparecem como selects no topo da própria aba.

---

## Atalhos de teclado e command palette

### Command palette (⌘K / Ctrl+K)

Abre busca global por:
- Tarefas (título e descrição) → abre o detalhe
- Clientes / Projetos / Pessoas → filtra Backlog
- Ações: nova tarefa, **captura rápida**, ir pra qualquer aba, exportar CSV, limpar filtros, alternar tema, recarregar, abrir ajuda

100% teclado: ↑↓ navegar · ↵ confirmar · Esc fechar.

### Captura rápida (⌘⇧N / Ctrl+Shift+N)

Overlay mínimo pra registrar uma tarefa em 2-5 segundos sem trocar de aba — só o título. Funciona **de qualquer lugar, inclusive enquanto você digita em outro campo**. Enter cria e mantém o overlay aberto pra capturar a próxima; Esc fecha.

A tarefa entra em `backlog` sem cliente, responsável nem prazo — vai direto pra **Triagem**, onde alguém refina depois. É a forma de não perder uma ideia/pedido no meio de outra coisa.

> O Chrome reserva ⌘⇧N pra aba anônima e pode não ceder o atalho. Se isso acontecer, use **⌘K → "Captura rápida"** — esse caminho sempre funciona.

### Atalhos globais

| Tecla | Ação |
|---|---|
| `⌘K` · `Ctrl+K` | Abrir/fechar command palette |
| `⌘⇧N` · `Ctrl+Shift+N` | Captura rápida (funciona até digitando) |
| `n` | Nova tarefa (formulário completo) |
| `/` | Foco na busca do Backlog (em outras abas, abre palette) |
| `g f` | Ir pra Meu foco |
| `g b` | Ir pra Backlog |
| `g k` | Ir pra Kanban |
| `g c` | Ir pra Calendário |
| `g d` | Ir pra Dashboard |
| `g t` | Ir pra Triagem |
| `g l` | Limpar filtros da tela atual |
| `?` | Abrir/fechar overlay com lista completa |
| `⌘↵` / `Ctrl↵` | No composer de comentário/reply: envia. No edit-comment: salva. |
| `Esc` | Encadeado: picker → linha-checklist-vazia → linha-checklist-com-texto → edit-comment → reply → lightbox → modal |

Atalhos **não disparam** quando você está digitando em campos.

### ESC encadeado (modal task)

ESC sempre fecha **o mais interno primeiro**. A sequência completa:

1. Picker de @-mention aberto → fecha picker, mantém modal aberto
2. Linha de checklist em foco, **vazia** → remove a linha
3. Linha de checklist em foco, **com texto** → tira o foco (cancela edição, mantém o texto)
4. Comentário em edição (✎) → cancela a edição
5. Reply ativa (caixa de resposta aberta) → cancela reply
6. Lightbox de anexo aberto → fecha lightbox
7. Nada acima ativo → fecha o modal (autosave já gravou)

Isso evita acidentes — você raramente precisa apertar ESC 3 vezes pra fechar. Cada nível tem affordance visual antes.

---

## Bulk actions na tabela

Disponível na aba **Backlog**.

1. Marque as tarefas (checkbox por linha) ou use o checkbox do header pra selecionar todas as visíveis.
2. Barra flutuante aparece no rodapé com:
   - **mover etapa** (sub-etapa, com optgroup por macro)
   - **atribuir responsável** (ou tirar)
   - **mudar prioridade** (P0–P3)
   - **excluir** (com confirmação)
   - **limpar seleção**

Mover etapa em massa registra histórico corretamente quando há cruzamento de macro.

---

## Comentários

Aba **Conversa** no modal da task. Composer no rodapé, lista cronológica em cima.

### Escrevendo

- Texto livre com markdown leve (negrito, link, line break).
- **Enviar**: clique no botão "comentar" ou ⌘↵ / Ctrl↵.
- **Toggle "Visível ao cliente no Portal"** logo abaixo do textarea — marcado = comentário sobe pro Portal cliente. Desmarcado = só interno. Default segue o último uso na sessão.
- **@mention** com 2 opções:
  - Digite `@` direto no texto → picker abre inline, filtrado pelo que vier depois do `@`. Navegue com ↑↓, confirma com Enter ou Tab, ESC cancela. Clique no nome também funciona — o cursor volta pro textarea já posicionado depois do nome.
  - Botão "@ mencionar" no rodapé do composer abre o mesmo picker manualmente.
  - Mention dispara notificação pra pessoa (mesmo se for você mesmo — útil pra lembrete).
  - Cliente externo não aparece no picker.

### Visualizando comentários publicados

Cada comentário mostra: avatar + autor + data + badge `cliente`/`SF` quando aplicável + **toggle "interno" / "externo"** (clica pra mudar visibilidade depois de postado). À direita do header: **✎ editar** e **✕ excluir** (quando você tem permissão).

- **Editar**: só o **próprio autor**. Inline textarea com Salvar/Cancelar. ⌘↵ salva, ESC cancela. Aparece tag itálica "(editado)" ao lado da data depois.
- **Excluir**: **autor ou admin**. Confirmação antes; respostas vão junto.
- **SF/Chatter**: comentários sincronizados do Salesforce têm badge SF e são imutáveis (sem editar, sem excluir, sem toggle).
- **Cliente externo**: badge "cliente", imutável pelo time interno (não dá pra mudar visibilidade — sempre `from_cliente=true`).

### Reply (1 nível)

Botão "↳ responder" abre textarea encadeada abaixo do comentário. Pode responder qualquer top-level mas não pode responder uma resposta (anti-thread infinito).

- **Herança de visibilidade**: se o parent é visível ao cliente (ou veio do cliente), a resposta automaticamente herda `visivel_cliente=true`. Senão, fica interna. Mantém coerência: nunca uma resposta vaza pro Portal um contexto interno.
- @mentions e ⌘↵ funcionam igual ao composer principal.

### Notificações disparadas

- **Mention** → pessoa mencionada recebe notif (sino + toast se online).
- **Assignment**: quando um responsável muda, o novo recebe notif. (Não é via comentário, é via mudança de campo.)
- **Comentário em task sua**: dono da task recebe notif quando alguém comenta.
- **Cliente respondeu**: cliente externo posta no Portal ou marca "Já respondi" → responsável recebe notif `cliente_respondeu`.

---

## Cronômetro e Timesheet

Time tracking opcional por task. Substitui (ou complementa) o preenchimento manual de `tempo_real_horas`.

### Iniciar/parar cronômetro

Botão **▶** no header (desktop) abre seletor de task ativa. Clica em alguma task em `em_desenvolvimento` → inicia o timer. Botão troca pra **⏸** com o tempo decorrido (atualiza a cada segundo).

- **Apenas uma sessão ativa por pessoa**. Se você inicia um timer em outra task, o anterior é fechado automaticamente (sem perda — vira registro fechado em `time_entries`).
- **Ao parar**, opcional adicionar uma nota curta sobre o que fez na sessão.
- O cronômetro **não pausa automaticamente** quando você troca de aba ou fecha o navegador — continua contando até você explicitamente parar.

### Aba Timesheet

Lista todos os registros (`time_entries`) da janela de 90 dias mais recente. Cada linha:

| Coluna | Descrição |
|---|---|
| Data/início | Quando o cronômetro começou |
| Task | Título com link (click abre modal) |
| Pessoa | Quem rodou (admin vê todas; outros, só as suas) |
| Duração | `endedAt - startedAt`. Em andamento mostra "rodando ⋯" com tempo vivo |
| Nota | O que escreveu ao parar (opcional) |
| 🗑 | Remove o registro (sem confirmação) |

Total acumulado no topo. Filtros (admin): "somente o meu" / seletor de pessoa.

### Relação com `tempo_real_horas`

O cronômetro **NÃO** preenche automaticamente o `tempo_real_horas` da task. Os dois campos coexistem:
- `tempo_real_horas`: total declarado pelo analista ao fechar a task (uma única medida agregada).
- `time_entries`: log granular de cada sessão de trabalho.

O time entry vai virar fonte de cálculo do `tempo_real_horas` no futuro (Onda IA pra agregar automaticamente). Hoje, ainda preenche os dois.

---

## Checklist da tarefa

Seção colapsável no painel esquerdo do modal (entre Descrição e Esforço). Cada item é uma mini-task com checkbox + texto.

- **Default colapsado** quando a task ainda não tem itens. Quando já tem, abre automaticamente ao abrir o modal.
- **Triângulo no título** (`▸` / `▾`) clica pra abrir/fechar. Contador `done/total` ao lado.
- **Adicionar item**: botão "+ adicionar item" no rodapé da seção. O input recebe foco imediato.
- **Checkbox done**: marca/desmarca. Linha riscada + opacity 60% quando done.
- **Editar texto**: input inline sem borda — parece texto inline, hover/foco revela underline discreto. Sem necessidade de "salvar" — autosave da task pega.
- **Atalhos dentro do checklist**:
  - **Enter** numa linha → cria nova linha abaixo (e foca nela)
  - **Backspace** em linha vazia → remove a linha
  - **ESC** em linha vazia → remove a linha
  - **ESC** em linha com conteúdo → blura (cancela foco, mantém texto)
- **Persistência**: gravado em `tasks.checklist` (JSONB). Salva via autosave da task ou clique em "salvar" do footer.
- **Realtime**: refresh em outra sessão pega as atualizações.

> Sem realtime multi-user collaborative dentro do checklist — duas pessoas editando ao mesmo tempo pode dar conflito de last-write-wins. Caso real: combine antes ou edite em momentos diferentes.

---

## Anexos (imagens via paste)

Aba **Anexos** no painel direito do modal. Pasta visual de prints, screenshots, mock-ups.

### Como anexar

- Tire o print (⌘⇧4 no Mac, Win+Shift+S no Windows).
- Volte ao modal da task (qualquer aba).
- Cole com **⌘V** / **Ctrl+V** em qualquer lugar do modal.
- O app **redimensiona automaticamente** pra 1600px no maior lado, recomprime pra JPEG q=0.85 (ou mantém PNG se a fonte era PNG e <800KB).
- Aparece um spinner "processando..." → "enviando..." → o thumb aparece no grid.

### Limites

- **Formato**: PNG, JPG, WebP. Outros formatos são ignorados ao colar (não dá erro, só passa direto).
- **Tamanho**: 2MB final (depois do downscale). Maior que isso → toast de erro, peça um print menor.
- **Storage**: bucket privado `task-attachments`. URLs assinadas com TTL 1h são geradas client-side toda vez que o modal abre.

### Visualizando

- Grid 2/3 colunas com thumbs quadrados.
- **Hover** revela dimensões (W×H) + tamanho do arquivo + botão de excluir.
- **Click no thumb** abre lightbox em tela cheia. Click no fundo escuro fecha; ESC também fecha (encadeado).

### Excluindo

- **Autor ou admin** podem excluir. Outros usuários não veem o `✕`.
- Confirmação antes de excluir.
- Storage object é removido junto (best-effort no client; órfãos eventuais são limpos pelo cron diário).

### Cleanup automático

Cron `cleanup-task-attachments-daily` roda **todo dia às 03:17 UTC** e apaga anexos (storage + rows) de tasks com status `concluido` há mais de **30 dias**. Mantém o bucket enxuto sem ação manual.

### Cascade quando task é excluída

- Excluir uma task pelo modal → anexos vão junto (cascade SQL + storage cleanup best-effort)
- Bulk-delete múltiplas tasks → idem
- Cliente/projeto não cascateia até a task (existing `ON DELETE RESTRICT` continua valendo — você precisa arquivar/excluir os filhos antes).

---

## Tasks criadas por IA

Automações externas (ex: **Cowork** lendo notas de reunião do Gemini) criam tasks via API. Essas tasks chegam marcadas com `criado_por_ia` e ganham um chip **🤖 IA** antes do título em todas as visões (Backlog, Kanban, Foco, Triagem, modal).

Como separar o fluxo de IA do fluxo humano:
- **Triagem** — chip de filtro `🤖 criadas por IA` (combina com `sem resp.` / `sem prazo` / `sem esforço`).
- **Backlog** — no menu ⋯, toggles "somente criadas por 🤖 IA" / "somente criadas por humanos".

Tasks criadas por IA sem cliente identificado caem direto na **Triagem** pra um humano atribuir cliente/responsável/prazo. A automação resolve o cliente pelos **domínios de email** cadastrados em Cadastros > Clientes (ver [Cadastros](#cadastros)).

> Tecnicamente: a automação consulta as edge functions `get-clientes` e `get-pessoas` pra descobrir o vocabulário, e cria via `ingest-task`. Detalhes de API ficam fora deste manual (ver docs de integração).

---

## Exportar (CSV)

Botão **↓ exportar** no canto superior direito (ou ⌘K → "Exportar").

- Exporta as **tasks visíveis** (respeita filtros aplicados na tela atual)
- Inclui todos os campos relevantes: cliente, projeto, responsável, prioridade, esforço, prazo, status, subetapa, tempo real, escopo, tags
- UTF-8 com BOM pra abrir sem dor de acentuação no Excel
- Arquivo: `kliente360-tarefas-<data>.csv`

> **Resumo Executivo PDF** está parqueado — leitura semanal hoje vem do Briefing direto. Quando entrar, deve consolidar Briefing + Dashboard num documento navegável pra reuniões offline.

---

## Login

Tela de login oferece **dois caminhos**:

- **Entrar com Google** (recomendado pro time interno) — botão branco no topo. Redireciona pro Google, volta logado. Sem rate limit de email.
- **Entrar com email** (cliente externo) — input + botão "Enviar código por email". Recebe um código de 6 dígitos no email; cola e entra.

Em ambos os casos:
- Lista fechada de pessoas — só entra quem está cadastrado em **Pessoas** com convite ativo.
- O primeiro login vincula a pessoa cadastrada à conta auth (por email match).
- Sessão fica salva no navegador; refresh não derruba.
- Logout pelo menu de avatar no topo direito.

Se o login validar mas a pessoa não estiver cadastrada/convidada, banner vermelho explica exatamente o que fazer.

---

## Tema, mobile, PWA

- **Tema**: ☾/☀ no topo. Respeita preferência do sistema na primeira visita.
- **Mobile**: layout adapta. Barra de abas vira **dropdown** (botão com aba atual + ▾ abre lista completa). **Kanban some** (executiva pouco prática em tela pequena; usa Backlog). **Backlog vira lista de cards**. Filtros viram drawer. **Header compacto**: visível só logo, +Nova, sino e avatar — exportar, tema e manual ficam dentro do menu do avatar.
- **Modal de task no mobile**: vira sheet card com margem de 12px (respeita safe-area do iPhone pro home indicator). 4 abas no painel: **Detalhes** · **Conversa** · **Anexos** · **Histórico**. Altura é fixa (não pula entre abas).
- **PWA**: no iPhone, "Adicionar à tela de início" instala como app com ícone próprio. Title da aba do navegador é "tasks 360".
- **Realtime**: qualquer mudança feita por outra pessoa aparece pra você em segundos sem refresh — inclusive comentários novos, checklist, anexos e mudanças de etapa.
- **Recarregar dados**: toca na **logo "tasks 360"** no canto superior esquerdo (a marca de 4 quadradinhos vai pulsar enquanto carrega). Útil no PWA onde refresh do navegador é difícil. Alternativas: F5 no navegador ou ⌘K → "Recarregar dados".

---

## Glossário

- **Aging** — quanto tempo a tarefa está parada na etapa atual. Vira badge laranja (warn) e depois vermelho (stale) quando passa do limite saudável daquela etapa.
- **Histórico de tarefa** — timeline unificada no rodapé do modal: mudanças de status (de `task_status_history`) + mudanças de campos rastreados (de `task_field_history`: prazo, esforço, prioridade, complexidade, responsável, etapa, tipo de trabalho, tempo real, bloqueado por). Cada linha mostra autor + mudança "de X → para Y" formatada (datas legíveis, UUIDs viram nomes).
- **Atrasada** — `prazo` passou e `status` ≠ `concluido`.
- **Cycle time** — tempo médio que uma tarefa leva entre `andamento` e `concluido`.
- **Lead time** — tempo médio entre criação e conclusão.
- **Macro / Nível 1** — uma das 4 etapas grandes (Backlog, Em andamento, Bloqueado, Concluído). Derivada automaticamente da sub-etapa.
- **Sub-etapa / Nível 2** — granularidade real da etapa. Onde você opera no kanban operacional.
- **Throughput** — número de tarefas concluídas em um período (7d, 30d, semanal).
- **Visão executiva** vs **operacional** — toggle no kanban: macro 4 colunas read-only ou granular 11 colunas editável.
- **Autosave** — após 800ms sem mexer na task aberta, salva sozinho. Indicador no header mostra `dirty` → `saving` → `saved` (ou `error`).
- **Visível ao cliente** — flag em `tasks.visivel_cliente` (entra no Portal) e em `task_comments.visivel_cliente` (comentário sobe pro Portal).
- **Reply herdando visibilidade** — se você responde uma pergunta do cliente, sua resposta automaticamente herda `visivel_cliente=true`. Inverso também: responder num thread interno mantém interno.
- **Checklist** — `tasks.checklist` (JSONB). Array de `{ id, body, done }`. Inline na task, sem tabela separada.
- **Anexos** — `task_attachments` (storage + linha). Cleanup automático 30d após task concluída. Cascade quando task é excluída.
- **Edited timestamp** — `task_comments.edited_em` populated quando o autor edita. Mostra "(editado)" inline no header do comentário.
- **ESC encadeado** — comportamento do ESC dentro do modal task. Documentado em [Atalhos](#atalhos-de-teclado-e-command-palette).
