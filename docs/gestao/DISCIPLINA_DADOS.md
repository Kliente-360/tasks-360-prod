# DISCIPLINA_DADOS.md · plano de campos & qualidade

> **Sessão**: brainstorm jun/2026 · pré-decisão Bucket D (novo)
> **Objetivo**: catálogo único de **todos** os campos do app (existentes + sugeridos) com propósito, quem preenche, quando, gate e o que quebra sem ele. Base pra decidir o que entra como obrigatório, o que vira opcional zumbi, e o que NÃO deve nascer.
>
> **Regra de filtro**: campo só vira "obrigatório" se responder às 3 perguntas:
> 1. **Quem preenche** (admin / interno / cliente / IA / derivado)
> 2. **Quando** (criação / em_definicao / escopo_definido / em_homologacao / pós-conclusão)
> 3. **O que QUEBRA sem ele** (capacity / SLA / aceite / matching / contratual / qualidade)
>
> Sem "o que quebra", o campo é desnecessário ou virou opcional histórico. Marcar **🗑** pra revisar.

---

## 1. Tabela `tasks` · campos existentes hoje (35 colunas)

### 1.1 · Identidade & navegação
| Campo | Tipo | Quem | Quando | Gate | Status |
|---|---|---|---|---|---|
| `id` | uuid pk | DB | criação | — | ✅ |
| `titulo` | text NOT NULL | quem cria | criação | display em toda lista | ✅ obrigatório |
| `descricao` | text default '' | quem cria | criação | **CRÍTICO** — vira insumo de IA-summary, contexto pro time, e fonte do "porquê" | 🟡 hoje opcional · proposta **forçar mínimo 1 linha** |
| `cliente_id` | uuid FK | quem cria | criação | RLS · agregações · capacity | ✅ obrigatório (gate Triagem) |
| `projeto_id` | uuid FK | quem cria | criação | capacity por projeto · SLA · orçamento | ✅ obrigatório (gate Triagem) |
| `pessoa_id` | uuid FK | quem cria · admin | criação ou Triagem | alocação · matching · sino de assigned | ✅ obrigatório (gate Triagem) |
| `ordem` | double | DB / drag | tempo todo | sort em Kanban/Foco | ✅ derivado |
| `tags` | text[] | quem cria | tempo todo | filtragem livre | 🟡 **subaproveitado** — ninguém usa hoje, revisar |
| `criado_em` / `criado_por_ia` | timestamp / bool | DB | criação | filtragem IA chip 🤖 | ✅ |

### 1.2 · Status & fluxo
| Campo | Tipo | Quem | Quando | Gate | Status |
|---|---|---|---|---|---|
| `status` | enum (backlog/andamento/bloqueado/concluido) | DB derivado de `subetapa` | trigger | macro de leitura cliente | ✅ |
| `subetapa` | enum (11 valores) | quem trabalha | rolling | **CRÍTICO** — define fluxo interno e visualização Kanban | ✅ obrigatório |
| `subetapa_em` | timestamp | DB | trigger | medida "X dias nesta etapa" | ✅ derivado |
| `status_em` | timestamp | DB | trigger | bottleneck · lead time | ✅ derivado |
| `andamento_em` | timestamp | DB | trigger | analytics throughput | ✅ derivado |
| `triada_em` / `triada_por` | timestamp / uuid | quem triou | aceitar/rejeitar na Triagem | controla fila Triagem | ✅ |
| `motivo_arquivamento` | text | quem arquiva | arquivar | analytics qualidade · IA | 🟡 hoje opcional · proposta **forçar** quando rejeita |
| `arquivado_em` | timestamp | DB | arquivar | filtro padrão "abertas" | ✅ |
| `bloqueado_por` | enum (nos/cliente/terceiro) + obrigatório comment | quem bloqueia | mudar subetapa pra `bloqueado` | analytics fricção · sino cliente | ✅ obrigatório (gate Foco) |
| `reopen_count` | integer | DB trigger | trigger | analytics qualidade | ✅ derivado |
| `privada` | boolean | dono | tempo todo | RLS · oculta de outros | ✅ |

### 1.3 · Estimativa & realizado
| Campo | Tipo | Quem | Quando | Gate | Status |
|---|---|---|---|---|---|
| `prioridade` | enum P0-P3 | quem triou / admin | Triagem em diante | ordenação · alertas · ranking | 🟡 hoje obrigatório com default P2 — proposta: **gate explícito na Triagem** (forçar revisão) |
| `complexidade` | enum (alta/media/baixa) | quem triou | Triagem | proxy de esforço · matching senioridade | 🟡 default `media` esconde "não preencheu" |
| `esforco` | numeric | interno | `em_definicao+` | **CRÍTICO** — capacity planning · alocação · alerta de estouro | 🔴 hoje opcional · proposta **forçar a partir de `escopo_definido`** |
| `tempo_real_horas` | numeric | interno | conclusão (ou rolling) | capacity realizado · ledger contratual | 🔴 hoje opcional · proposta **forçar no Concluir** (gate Bucket T) |
| `prazo` | date | interno | criação ou Triagem | SLA · atrasada · forward capacity | ✅ obrigatório (gate Triagem) |
| `tipo_trabalho` | enum (bug/feature/discovery/manutencao/admin) | quem triou | Triagem | mix-of-work analytics | 🔴 **só 1 entry em histórico em jun/2026** · não usado · forçar ou remover |

### 1.4 · Escopo técnico
| Campo | Tipo | Quem | Quando | Gate | Status |
|---|---|---|---|---|---|
| `escopo` | text[] (lista de skills/áreas) | interno | `em_definicao+` | matching com `pessoas.skills` no dropdown | 🟡 subaproveitado — só usado no matching, sem gate forte |
| `checklist` | jsonb | interno | rolling | granularidade de progresso interno | 🟡 opcional |
| `solucao_implementada` | text | interno | `em_homologacao+` | insumo IA-summary entrega vs pedido | ✅ novo (v1.03.148) · opcional · monitorar adoção |

### 1.5 · Cliente & visibilidade
| Campo | Tipo | Quem | Quando | Gate | Status |
|---|---|---|---|---|---|
| `visivel_cliente` | boolean | interno / IA | criação · rolling | Portal cliente · RLS | ✅ |
| `external_source` / `external_id` | text | webhook | criação | bidi SF/Cowork | ✅ |
| `last_ingest_at` / `webhook_sync_*` | timestamp/text | webhook | rolling | observabilidade SF | ✅ |

---

## 2. Tabela `pessoas` · campos existentes (15)

| Campo | Quem | Quando | Gate | Status |
|---|---|---|---|---|
| `nome`, `email` | admin | onboarding | display · login | ✅ |
| `role` (admin/interno/cliente) | admin | onboarding | RLS | ✅ |
| `cliente_id` (do cliente externo) | admin | onboarding | RLS cliente | ✅ obrigatório se role=cliente |
| `cliente_principal_id` / `cliente_secundario_id` | admin | onboarding | foco da pessoa interno | ✅ |
| `capacidade_horas_semana` | admin | onboarding | capacity planning | 🟡 default 40 — provavelmente **não revisado por pessoa real** |
| `skills` | admin / própria pessoa | onboarding · rolling | matching task.escopo | 🔴 **adoção baixa** — proposta forçar mínimo 3 skills no onboarding |
| `senioridade` | admin | onboarding | C.4 alerta de alocação | 🔴 hoje opcional — proposta tornar obrigatório |
| `is_ceo` / `is_pm` | admin | onboarding | UI flags | ✅ |
| `invited_at` | sistema | invite | filtro de pessoas atribuíveis | ✅ |

---

## 3. Tabela `projetos` · campos existentes (8)

| Campo | Quem | Quando | Gate | Status |
|---|---|---|---|---|
| `nome` | admin | criação | display | ✅ |
| `cliente_id` | admin | criação | hierarquia | ✅ |
| `tipo` (sustentacao/fechado/etc) | admin | criação | analytics de capacidade | ✅ |
| `sla_resposta_horas` / `sla_entrega_dias` | admin | criação | alertas SLA | 🔴 **não usado em alertas hoje** — proposta wirar pra Foco/Briefing |
| `orcamento_horas` | admin | criação | capacity de sustentação | ✅ usado |
| `arquivado_em` | admin | arquivar | filtro | ✅ |

---

## 4. Tabela `clientes` · campos existentes (10)

| Campo | Quem | Quando | Gate | Status |
|---|---|---|---|---|
| `nome` | admin | criação | display | ✅ |
| `tier` (estrategico/potencial/descoberta) | admin | criação | ranking · agregações | 🟡 subaproveitado em UI |
| `eh_interno` | admin | criação | RLS Kliente 360 | ✅ |
| `dominios` | admin | criação | gate AppScript IA | ✅ (v1.03.145) |
| `webhook_enabled` | admin | criação | gate SF + IA | ✅ (v1.03.147) |
| `cor_portal` / `cor_portal_texto` | admin | criação | identidade Portal | ✅ |

---

## 5. Tabela `task_comments` · campos existentes (11)

| Campo | Quem | Quando | Gate | Status |
|---|---|---|---|---|
| `texto` | autor | tempo todo | comunicação · IA-summary · sino | ✅ |
| `visivel_cliente` | autor | criação | RLS · Portal · webhook SF | ✅ |
| `from_cliente` | sistema | criação | sino "cliente respondeu" | ✅ |
| `parent_id` | autor | criação | thread (1 nível) | ✅ |
| `edited_em` | sistema | edit | UI "editado" | ✅ |

---

## 6. Tabela `time_entries` · campos existentes (7)

| Campo | Quem | Quando | Gate | Status |
|---|---|---|---|---|
| `started_at` / `ended_at` | cronômetro / manual | rolling | ledger contratual · capacity realizado | 🔴 cobertura <10% — Bucket T |
| `note` | interno | rolling | granularidade | 🟡 opcional |

---

## 7. SEUS itens sugeridos no brainstorm

| # | Item | Mapeamento atual | Quem | Quando | Gate / Quebra | Veredito |
|---|---|---|---|---|---|---|
| 1 | esforço previsto | `esforco` (existe) | interno | `em_definicao+` | capacity · alocação | ✅ **forçar** a partir de `escopo_definido` |
| 2 | horas trabalhadas | `time_entries` + `tempo_real_horas` (existem) | interno | rolling / conclusão | ledger contratual | ✅ **forçar** no Concluir (Bucket T) |
| 3a | escopo técnico da task | `escopo[]` (existe) | interno | `em_definicao+` | matching skill | ✅ **forçar** a partir de `escopo_definido` |
| 3b | escopo técnico da pessoa | `pessoas.skills[]` (existe) | admin / pessoa | onboarding · rolling | matching dropdown | ✅ **forçar** mínimo 3 skills |
| 4 | descricao + valor esperado | `descricao` (existe) | quem cria | criação | contexto IA | 🟡 **NÃO criar campo novo** — forçar mínimo 1 linha em `descricao` com prompt sugerido "**O que** + **Por que** + **Valor esperado**" |
| 5a | solução entregue | `solucao_implementada` (existe v1.03.148) | interno | `em_homologacao+` | IA-summary | ✅ já existe — **monitorar adoção, talvez forçar no Concluir** |
| 5b | valor entregue (realizado) | — **novo** | interno / cliente | pós-conclusão | qualidade entrega · NPS interno | 🟡 **opcional 1 linha pós-conclusão** ("Como isso ajudou?") |
| 6a | cliente abrir tasks | — **novo** | cliente | tempo todo | autonomia cliente · realtime real | ⚠️ requer RLS + UI + fluxo de Triagem (cliente cria → pré-triagem do time) |
| 6b | cliente redefinir prioridade | — **questionado** | cliente | tempo todo | — | 🚫 **não fazer** — vira batalha. Substituir por `prioridade_solicitada_cliente` (livre, separada do P0-P3 real) |
| 7 | capacidade contratual × ativa | `projetos.orcamento_horas` + `time_entries` | derivada | mensal | ledger consumido vs contratado | ✅ **Bucket T → C.11** já no roadmap |
| 8 | complexidade pra alocação | `complexidade` (existe) | quem triou | Triagem | proxy esforço · alerta C.4 | 🟡 **forçar revisão na Triagem** (não aceitar default `media` silencioso) |

---

## 8. MEUS itens adicionais

| # | Item | Mapeamento | Quem | Quando | Gate / Quebra | Veredito |
|---|---|---|---|---|---|---|
| A | critério de aceite / DoD | — **novo** | interno | `escopo_definido+` | gate de conclusão · cliente entende quando "tá pronto" | ✅ campo `criterio_aceite text` |
| B | dependências entre tasks | `task_dependencies` (dropada) | interno | rolling | gate de conclusão · sequenciamento | ⚠️ **reativar** via `bloqueada_por_tasks uuid[]` em `tasks` (simples, sem nova tabela) — só se cliente vai abrir tasks |
| C | ledger contratual UI | derivada (Bucket T+C.11) | — | mensal | Portal cliente · briefing | ✅ já no roadmap |
| D | motivo de reabertura | — **novo** | quem reabre | ato de reabrir | analytics qualidade (real vs ruído) | ✅ enum `motivo_reabertura` no momento de reabrir |
| E | tempo de resposta do cliente | derivada de comments | sistema | — | métrica "fricção cliente" · alerta SLA | ✅ derivado de `task_comments.from_cliente` + timestamps |
| F | aprovação explícita de entrega | — **novo** | cliente / ponto focal | `em_homologacao → concluido` | gate de conclusão pro cliente | ⚠️ avaliar — pode virar fricção. Talvez button no Portal "aprovo entrega" → trigger `concluido` |
| G | tags subaproveitada hoje | `tags[]` (existe) | — | — | — | 🗑 **revisar**: usar pra algo concreto ou remover do modal |
| H | tipo_trabalho subaproveitado | `tipo_trabalho` (1 entry) | — | — | — | 🗑 **forçar na Triagem** ou remover |
| I | senioridade obrigatória | `pessoas.senioridade` (existe) | admin | onboarding | alerta C.4 · alocação | ✅ **forçar** no onboarding |
| J | capacidade revisada por pessoa | `pessoas.capacidade_horas_semana` | admin | onboarding · rolling | capacity per-pessoa real | ✅ **revisar default 40** — admin valida individualmente |
| K | SLA wirado em alertas | `projetos.sla_*` | — | — | — | 🟡 **C.10 publicação** já cobre |

---

## 9. Síntese · 4 ondas propostas

### Onda 1 · Gate Triagem (sem mexer em schema · 1 semana)
Forçar revisão explícita de campos que existem mas têm default silencioso:
- `complexidade` (não aceitar `media` default sem confirmação)
- `prioridade` (forçar review na Triagem)
- `tipo_trabalho` (forçar valor explícito)
- `prazo` + `pessoa_id` + `cliente_id` + `projeto_id` (já são gate hoje · validar enforcement)

**Impacto**: melhora qualidade de classificação imediato · zero risco · zero migration.

### Onda 2 · Gate por subetapa (1-2 semanas · 1 migration)
Forçar campos relevantes em cada subetapa de avanço:
- `escopo_definido` → exige `esforco > 0` + `escopo[]` não vazio + `criterio_aceite` (campo novo)
- `em_homologacao` → exige `solucao_implementada`
- `concluido` → exige `tempo_real_horas > 0` (alinhado a Bucket T.6)

**Impacto**: força disciplina sem virar formulário · gate só onde precisa.

### Onda 3 · Onboarding de pessoa (1 semana · sem migration)
- Forçar `skills` mínimo 3
- Forçar `senioridade`
- Revisar `capacidade_horas_semana` individual no onboarding
- Mostrar % de adoção desses 3 campos no Briefing/Dashboard

**Impacto**: matching real · alertas C.3/C.4 ganham relevância.

### Onda 4 · Disciplina via IA (depois B.3)
- IA prompta autor de task com prosa fraca: "tua descricao tá vazia, posso sugerir baseado em comments?"
- IA gera draft de `solucao_implementada` baseado em comments + diffs de subetapa
- IA classifica `tipo_trabalho` automaticamente na Triagem

**Impacto**: tira fricção humana · enche dados em background.

### Onda 5 · Cliente ativo no produto (sprint dedicado · 2-3 semanas)
**Só se decidir "cliente abre tasks (6a)" como obrigatório pré-launch**:
- RLS `tasks_cliente_insert` (apenas no cliente_id próprio · `visivel_cliente=true` forçado · gate pré-triagem)
- Campo `prioridade_solicitada_cliente` (livre, não vira P0-P3 oficial)
- UI no Portal · botão "Nova solicitação"
- Triagem ganha aba "Solicitações do cliente"
- Aprovação explícita de entrega no Portal (F)

**Impacto**: gigante · mas pode adiar pra pós Pão e Talho consolidar.

---

## 10. Decisões pendentes pra você

Antes de transformar isso em Bucket D no STATUS:

1. **Onda 5 (cliente ativo)**: dia 1 do Pão e Talho ou pós-launch?
2. **Critério de aceite** (A): obrigatório a partir de `escopo_definido` ou só recomendado?
3. **Dependências** (B): reativar — campo `bloqueada_por_tasks uuid[]` em `tasks` (simples) ou tabela `task_dependencies` (mais robusta)?
4. **Aprovação de entrega** (F): cliente aprova explicitamente no Portal antes de `concluido`?
5. **Subaproveitados** (G `tags`, H `tipo_trabalho`): forçar uso ou remover do modal?
6. **`valor entregue` (5b)**: criar campo opcional ou descartar?

Responde essas 6 e eu transformo em Bucket D · Disciplina de dados no STATUS, com itens priorizados.
