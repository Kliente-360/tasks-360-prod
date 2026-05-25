# KPIs do tasks 360 · referência completa

> Catálogo de métricas e indicadores usados no app, organizados por categoria conceitual.
> Última atualização: mai/2026 · v1.02.050

Para cada KPI: pergunta-resposta, cálculo, por quê importa, onde está hoje (ou onde está proposto), e thresholds quando há calibração.

---

## 1. Adoção da ferramenta (uso interno)

Vivem na aba **Adoption · Hero** (6 indicadores com sinal verde/amarelo/vermelho + conclusão heurística).

### 1.1 DAU/WAU (Daily Active / Weekly Active)
- **Pergunta:** "Quem entrou no mês também voltou na semana?"
- **Cálculo:** `usuários únicos com evento últimos 7d ÷ usuários únicos últimos 30d × 100`
- **Por quê:** mede retenção contínua. Métrica clássica SaaS — se sobe, hábito; se cai, churn interno em formação.
- **Thresholds:** ≥70% verde · 50-69% amarelo · <50% vermelho
- **Onde:** Adoption hero · card 1.

### 1.2 Sessões/dia (densidade de uso)
- **Pergunta:** "Com que frequência o time abre o app no dia?"
- **Cálculo:** `total de sessões únicas (session_id) em 7d ÷ 7`
- **Por quê:** mede densidade individual. Quem usa diário abre 5+ sessões; quem usa "pra checar quando lembra" abre <3.
- **Thresholds:** ≥5 verde · 3-5 amarelo · <3 vermelho
- **Onde:** Adoption hero · card 2.

### 1.3 Comments públicos/sem (engajamento conversacional)
- **Pergunta:** "O time conversa COM o cliente pelo app, ou é planilha de tracking?"
- **Cálculo:** `# comments com visivel_cliente=true criados nos últimos 7d`
- **Por quê:** se o time só atualiza status sem comentar publicamente, o diferencial Portal cliente está parado. Comments públicos são o lock-in real do cliente externo.
- **Thresholds:** ≥20 verde · 10-20 amarelo · <10 vermelho
- **Onde:** Adoption hero · card 3.

### 1.4 Tasks triadas (% qualidade do cadastro)
- **Pergunta:** "As tasks abertas têm informação suficiente pra ser priorizadas?"
- **Cálculo:** `# tasks ativas com pri+esf+resp+prazo conforme etapa ÷ total ativas × 100` (via helper puro `needsTriage(t)`)
- **Por quê:** mede disciplina de cadastro. Sem isso, heurísticas de capacidade são ruído.
- **Thresholds:** ≥80% verde · 60-80% amarelo · <60% vermelho
- **Onde:** Adoption hero · card 4. Também alimenta a aba **Triagem**.

### 1.5 Retention W1 (continuidade semanal)
- **Pergunta:** "Quem usou esta semana TAMBÉM usou semana anterior?"
- **Cálculo:** `|ativos 0-6d ∩ ativos 7-13d| ÷ |ativos 7-13d| × 100`
- **Por quê:** métrica SaaS canônica de hábito vs trial. Se cai abaixo de 60%, time usa "pra emergência" e não virou rotina.
- **Thresholds:** ≥80% verde · 60-80% amarelo · <60% vermelho
- **Onde:** Adoption hero · card 5.

### 1.6 Movimentação 7d (calor do pipeline)
- **Pergunta:** "Quantas tasks ativas tiveram update na última semana?"
- **Cálculo:** `# tasks ativas com max(subetapaEm, statusEm) nos últimos 7d ÷ total ativas × 100`, com Δ em pontos percentuais vs semana anterior
- **Por quê:** mede se o pipeline tá quente ou congelado. Se cai com DAU estável = friction no fluxo (gargalo, bloqueios silenciosos).
- **Thresholds:** ≥60% verde · 40-60% amarelo · <40% vermelho
- **Onde:** Adoption hero · card 6.

---

## 2. Performance / Velocity

### 2.1 Throughput (taxa de entrega)
- **Pergunta:** "Quantas tasks o time conclui por unidade de tempo?"
- **Cálculo:**
  - `throughput7d` = # tasks concluídas nos últimos 7d
  - `throughput30d` = # tasks concluídas nos últimos 30d
  - **Throughput W1** = throughput7d com Δ pp vs sem ant (proposto no Dashboard v2)
- **Por quê:** output puro. Junto com lead time, é a régua principal de produtividade.
- **Onde:** Dashboard · velocidade card. Migra pro **hero do Dashboard** na proposta v2.

### 2.2 Lead time médio (tempo de ciclo total)
- **Pergunta:** "Quanto tempo a task vive aberta, da criação até conclusão?"
- **Cálculo:** Para cada task concluída nos últimos 30d, `(data_conclusao - data_criacao)` em dias. Média.
- **Por quê:** mede eficiência ponta-a-ponta. Inclui filas e tempo parado. Cresce quando há bottleneck.
- **Threshold sugerido:** ≤7d verde · 7-14d amarelo · >14d vermelho
- **Onde:** Dashboard · velocidade card. Também tem versão **por cliente** (chartLeadTime). Computado em `core-data.js#_completedWithTimes` via `task_field_history`.

### 2.3 Cycle time médio (tempo no pipeline ativo)
- **Pergunta:** "Quanto tempo a task fica na fase ativa (em desenvolvimento), excluindo backlog?"
- **Cálculo:** Para cada task concluída nos últimos 30d com transição pra `andamento`, `(data_conclusao - data_andamento)` em dias. Média.
- **Por quê:** isola velocidade real de execução vs tempo na fila. Se cycle é baixo mas lead é alto, problema é priorização (tasks ficam no backlog). Se cycle é alto, problema é execução (gargalo no pipeline).
- **Threshold sugerido:** ≤4d verde · 4-8d amarelo · >8d vermelho
- **Onde:** Dashboard · velocidade card.

### 2.4 % entregue no prazo (qualidade da estimativa) · **proposto**
- **Pergunta:** "Das tasks concluídas, quantas fecharam antes ou no prazo cadastrado?"
- **Cálculo:** `# tasks concluídas 30d com data_conclusao ≤ prazo ÷ # tasks concluídas 30d com prazo × 100`
- **Por quê:** mede qualidade da estimativa + execução. Diferente de lead time (que mede velocidade), mede **previsibilidade**.
- **Threshold sugerido:** ≥80% verde · 60-80% amarelo · <60% vermelho
- **Onde:** Proposto no Dashboard v2 (4º KPI hero). Ainda não existe.

---

## 3. Capacidade / Carga

### 3.1 Capacidade horas/semana (cadastral)
- **Pergunta:** "Quantas horas a pessoa tem disponíveis por semana?"
- **Cálculo:** Campo `pessoas.capacidade_horas_semana` (default 40h pra full-time, 20h pra meio expediente, etc.)
- **Por quê:** denominador de toda análise de carga. Sem isso, "Drieli tem 60h alocadas" é número solto.
- **Onde:** Cadastros · Pessoas. Usado em Briefing · capacidade vs demanda.

### 3.2 % capacidade utilizada (`pctCap`)
- **Pergunta:** "Quanto da capacidade da pessoa está alocado em tasks ativas?"
- **Cálculo:** `Σ esforco das tasks ativas atribuídas ÷ capacidade_horas_semana × 100`
- **Por quê:** régua de sobrecarga individual. Acima de 100% = pessoa não vai entregar tudo.
- **Thresholds** (via helper puro `cargaNivelFromPctCap`):
  - `>130%` sobrecarga
  - `100-130%` pressão
  - `60-100%` ok
  - `<60%` folga
  - `null/sem capacidade` sem-cap (não rateia)
- **Onde:** Briefing · reportTeamLoad. Heurística **H15** (sobrecarga semana W).

### 3.3 Bucketing semanal (Onda D · 4 semanas)
- **Pergunta:** "Quando a carga estoura?"
- **Cálculo:** Cada task ativa cai em um bucket [W0, W1, W2, W3] baseado no `prazo`:
  - Sem prazo → assume semana atual (W0)
  - Prazo na semana atual → W0
  - Atrasada → puxa pra W0
  - 1-3 semanas adiante → W1/W2/W3
  - Fora da janela 4 semanas → ignora (longo prazo)
  - Defaults só pra análise (não altera dado real).
- **Por quê:** identifica picos. "Drieli a 145% W0 mas 80% W1" significa redistribuição possível.
- **Onde:** Briefing · heatmap pessoa × semana. Também sugestões de redistribuição.

### 3.4 Variância de carga · **proposto**
- **Pergunta:** "A carga está distribuída ou concentrada?"
- **Cálculo:** `max(pctCap) ÷ min(pctCap)` entre pessoas ativas (excluindo `null/sem-cap`)
- **Por quê:** mede desbalanceamento de time. Variância 2.4x = uma pessoa carrega o dobro de outra. Mesmo sem ninguém individual estourar, sinal de mal alocação.
- **Threshold sugerido:** <1.5x verde · 1.5-2.5x amarelo · >2.5x vermelho
- **Onde:** Proposto no Dashboard v2 · seção "Gaps & desvios". Ainda não existe.

### 3.5 Capacidade total time vs demanda total
- **Pergunta:** "O time como um todo tem capacidade pra fechar a sprint?"
- **Cálculo:** `Σ capacidade_horas_semana (todas pessoas) vs Σ esforco tasks ativas (todas)`
- **Por quê:** macro view. Se demanda > capacidade, sprint vai estourar independente de redistribuição.
- **Onde:** Briefing · cards executivos (capacidade vs demanda).

---

## 4. Operação / Estados (counts)

### 4.1 Atrasadas
- **Definição:** `prazo < hoje AND status !== 'concluido'`
- **Por quê:** sinaliza falha de entrega. Helper puro `atrasada(t)`.
- **Onde:** Foco card, Dashboard KPI, atrasadasList (top 8).

### 4.2 Para hoje
- **Definição:** `prazo === hoje AND !atrasada AND status !== 'concluido'`
- **Por quê:** agenda do dia. Foca o que deve fechar nas próximas horas.
- **Onde:** Foco card, focusGroups.hoje.

### 4.3 Bloqueadas
- **Definição:** `status === 'bloqueado'`
- **Por quê:** ações represadas. Pode ser bloqueio interno OU externo (`bloqueado_por in ('nos','cliente','terceiro')`).
- **Onde:** Foco card, Dashboard KPI, bloqList. Subcategoria importante: bloqueio por `cliente` vira aguardandoClienteList.

### 4.4 P0/P1 ativas
- **Definição:** `prioridade in (P0, P1) AND status !== 'concluido' AND não já em atrasadas/hoje/bloqueadas`
- **Por quê:** urgência declarada que ainda não virou crise.
- **Onde:** Foco card.

### 4.5 Aging (idade da task na etapa atual)
- **Definição:** `Date.now() - subetapaEm` em dias.
- **Por quê:** mede acúmulo. Task com aging >7d em "em homologação" = gargalo na revisão.
- **Onde:** Cards de task (badge inline), heurísticas de bloqueio.

### 4.6 Reopen count / rate
- **Definição:** `tasks.reopen_count` — incrementado por trigger SQL quando task volta de concluído pra aberto.
- **Por quê:** sinaliza retrabalho crônico (qualidade baixa de entrega).
- **Onde:** Modal task (chip "reaberta Nx"). Heurística **H7** (reaberturas crônicas ≥2).

---

## 5. Saúde / Risco (semáforos)

### 5.1 Saúde por cliente (semáforo)
- **Pergunta:** "Esse cliente está em situação saudável?"
- **Cálculo:** Combinatória de sinais (`reportClientHealth` em briefing.js):
  - 🔴 vermelho: atrasadas críticas OR SLA quase vencido OR bloqueio cliente +5d
  - 🟡 amarelo: aguardando cliente OR aging warn
  - 🟢 verde: nada crítico
- **Onde:** Dashboard · saúde por projeto (deriva). Briefing · cards. Heurística **H3** (estratégico atrasado).

### 5.2 Saúde por pessoa (semáforo)
- **Pergunta:** "Essa pessoa está sobrecarregada/estagnada?"
- **Cálculo:** Combinatória (`saudePessoas`):
  - 🔴 vermelho: atrasadas críticas OR stale (>14d sem update)
  - 🟡 amarelo: bloqueio interno OR aguardando cliente OR aging warn
  - 🟢 verde: ok
- **Onde:** Dashboard · saúde por pessoa. Briefing.

### 5.3 SLA breach rate · **parcialmente implementado**
- **Pergunta:** "Qual % das tasks com SLA estouram o prazo contratual?"
- **Cálculo:** `# tasks concluídas no mês que estouraram SLA ÷ # tasks com SLA × 100`. SLA vem de `projetos.sla_resposta_horas` e `sla_entrega_dias`.
- **Por quê:** mede risco contratual. Sustentação tem SLA estrito; estouro repetido = renegociação ou churn.
- **Onde:** Heurística **H5** (SLA quase vencido). Proposto pro Dashboard v2 como gap interpretado.

### 5.4 Bottleneck por sub-etapa · **proposto**
- **Pergunta:** "Em qual sub-etapa as tasks ficam mais tempo paradas?"
- **Cálculo:** Média de aging por sub-etapa (`em_desenvolvimento`, `em_homologacao`, `em_revisao`, etc.)
- **Por quê:** identifica gargalo organizacional. Se aging em "em homologação" é 4.2d e em "em desenvolvimento" é 1.8d, falta revisor.
- **Onde:** Proposto no Dashboard v2 · seção Gaps & desvios. Ainda não existe.

---

## 6. Externo / Cliente (Portal)

### 6.1 Lead time por cliente (90d)
- Mesmo cálculo do §2.2, segmentado por cliente.
- **Onde:** Dashboard · chartLeadTime. Portal cliente · KPI próprio.

### 6.2 Throughput cliente (sparkline 6m)
- Mesmo cálculo do §2.1, segmentado por cliente, em granularidade mensal.
- **Onde:** Portal cliente · sparkline.

### 6.3 Concentração de cliente · **proposto**
- **Pergunta:** "Quantos % das horas do time estão num único cliente?"
- **Cálculo:** `Σ esforco tasks ativas de cliente X ÷ Σ esforco todas tasks ativas × 100`
- **Por quê:** mede risco de churn por concentração. >50% num cliente = vulnerável.
- **Onde:** Proposto no Dashboard v2 · Gaps & desvios.

### 6.4 Adoção do portal pelo cliente
- Mesmo conceito das métricas Adoption, mas medindo o **cliente externo** (eventos `cliente_portal_login`, comments do cliente, etc.).
- **Onde:** Adoption · toggle "portal cliente".

---

## 7. Orçamento / Margem (parcial)

### 7.1 % orçamento executado
- **Pergunta:** "Quanto do orçamento contratado já foi usado?"
- **Cálculo:** `Σ tempo_real_horas tasks concluídas + Σ esforco tasks ativas ÷ projeto.orcamento_horas × 100`
- **Por quê:** mede estouro de escopo. Acima de 100% = perda de margem.
- **Thresholds:** <90% verde · 90-110% risco · >110% estouro
- **Onde:** Heurística **H13** (projeto estourando escopo) e **H14** (em risco). Briefing.

### 7.2 % sustentação utilizada (por semana W)
- Mesmo conceito de §7.1, aplicado a contratos de sustentação por janela semanal.
- **Onde:** Heurística **H11** (sustentação estourando) e **H12** (sustentação ociosa).

---

## Mapa visual · onde cada KPI vive

| Aba | KPIs visíveis |
|---|---|
| **Foco** | Atrasadas, Para hoje, Bloqueadas, P0/P1 ativas |
| **Backlog/Kanban** | Aging inline em cards |
| **Triagem** | % triadas (mesmo getter do Adoption) |
| **Dashboard (hoje)** | Em andamento h, Backlog h, Bloqueadas, Atrasadas, Throughput 7d/30d, Lead time, Cycle time |
| **Dashboard (proposto v2)** | Throughput W1, Lead time, Cycle time, % entregue no prazo, Gaps & desvios (variância carga, breach rate, bottleneck, concentração) |
| **Briefing** | Capacidade vs demanda, Saúde por cliente/pessoa, Tendência, Heurísticas |
| **Adoption** | DAU/WAU, Sessões/dia, Comments públicos/sem, Tasks triadas, Retention W1, Movimentação 7d |
| **Portal cliente** | Lead time 90d, Sparkline 6m, Aguardando você, Próximas entregas |

---

## Convenções gerais

- **Sinal verde/amarelo/vermelho** segue tokens CSS `--sig-green-*`, `--sig-amber*`, `--p0*`.
- **Período padrão** de análise: 7d para movimento, 30d para velocidade, 90d para lead time por cliente.
- **Cliente interno** (`eh_interno=true` · bucket "Kliente 360") sempre excluído de heurísticas de carga, sobrecarga, redistribuição, projeto estouro e do Portal.
- **Helpers puros** (`atrasada`, `effEsforco`, `effTamanho`, `cargaNivelFromPctCap`, `weekStartMonday`, `bucketTasksByWeek`, `triageFailures`, `needsTriage`) ficam em `lib/helpers.js` e são testáveis em `tests/index.html`.
- **Bumpe BUILD** em qualquer commit que adicione/altere KPI. Atualize esta doc junto.
