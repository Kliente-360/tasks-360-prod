# MODAL_REDESIGN_BRIEF.md · briefing UX/UI

> **Contexto**: pós-Bucket D · modal de task tem 25 campos visíveis ·
> precisa redesign pra equilibrar densidade × discoverability ×
> hierarquia. Tasks de exemplo capturadas em prod (v1.03.165).
>
> **Versão app**: v1.03.165 · 22/06/2026
> **Telas auditadas**: `[TI] Unidade teste na estrutura API` em
> `https://app.kliente360.com/kanban?task=362fdf57-...`
> **Screenshots da sessão de auditoria**: `ss_070101vl4` · `ss_1345e9vh0` · `ss_3214z5u8f` · `ss_4064w9fpx`

---

## 1. Inventário · 25 campos do modal desktop

### 1.1 · Header (sempre visível)

| Elemento | Tipo | Editável? | Notas |
|---|---|---|---|
| Título | text | sim · inline | "[TI] Unidade teste na estrutura API" |
| Chip prioridade | derivado | não · só leitura | P0/P1/P2/P3 ou "revisar" |
| Chip prazo | derivado | não · só leitura | 02/06 |
| Chip cliente | derivado | não · só leitura | Bodytech |
| Chip autosave | derivado | não · só leitura | `ativo` / `salvando` / `⚠ FALHOU` |
| Botão copy link | ação | sim | |
| Botão × fechar | ação | sim | |

### 1.2 · Seção "Atribuição" (grid 2 col)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 1 | Cliente | select | sim | sempre · Triagem |
| 2 | Projeto | select (dep cliente) | sim | sempre · Triagem |
| 3 | Responsável | select (filtra skill) | sim | sempre · Triagem |
| 4 | Prioridade | select (com "revisar") | sim | sempre · Triagem |
| 5 | Solicitada pelo cliente | select (alta/media/baixa) | não | informativo (3.4) |

### 1.3 · Seção "Descrição" (full-width)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 6 | Solicitação | textarea | recomendado | criação |
| 7 | Valor Esperado | textarea | recomendado | criação |

### 1.4 · Seção "Critério de aceite" (full-width)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 8 | Critério de aceite | textarea | sim | `escopo_definido+` (3.1) |

### 1.5 · Seção "Entrega" (full-width, condicional)

Aparece só de `em_homologacao` em diante.

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 9 | Solução implementada | textarea | sim | ao concluir (3.5) |
| 10 | Valor entregue | textarea | sim | ao concluir (3.5) |

### 1.6 · Seção "Bloqueada por (pré-requisitos)" (full-width)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 11 | bloqueada_por_tasks | multi (chips + dropdown) | não | conclusão bloqueada se pré-req aberta (3.2) |

### 1.7 · Seção "Checklist" (colapsável)

| # | Campo | Tipo | Obrigatório? |
|---|---|---|---|
| 12 | checklist[] | jsonb (items toggle) | não |

### 1.8 · Seção "Esforço" (grid 2 col)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 13 | Complexidade | select | recomendado | Triagem (default `media`) |
| 14 | Prazo | date | sim | Triagem |
| 15 | Estimado (h) | number | sim | `escopo_definido+` (2.4) |
| 16 | Realizado (h) | number | sim | `em_homologacao→concluido` (2.5) |

### 1.9 · Seção "Etapa + Visibilidade" (grid 2 col)

| # | Campo | Tipo | Obrigatório? |
|---|---|---|---|
| 17 | Subetapa | select (11 valores) | sim |
| 18 | Visível ao cliente | checkbox | default true |

### 1.10 · Seção "Escopo" (multi-chip · obrigatório · 3 sub-grupos)

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 19 | Escopo (Salesforce) | chips (7 valores) | sim | `em_definicao+` (2.6) |
| 20 | Escopo (Clouds) | chips (3 valores) | parte de 19 | |
| 21 | Escopo (Digital/IA) | chips (3 valores) | parte de 19 | |

### 1.11 · Seção "Privacidade" (checkbox)

| # | Campo | Tipo | Obrigatório? |
|---|---|---|---|
| 22 | Privada (CEO) | checkbox | não |

### 1.12 · Seção "Reabertura" (condicional)

Aparece só quando task estava `concluido` e foi movida pra outra subetapa.

| # | Campo | Tipo | Obrigatório? | Gate |
|---|---|---|---|---|
| 23 | Motivo da reabertura | select (4 opções) | sim | quando reabrindo (3.3) |

### 1.13 · Right panel · timeline (sempre visível)

| Tab | Tipo | Contagem típica |
|---|---|---|
| Conversa | thread (5-50 comments) | **primária** |
| Anexos | grid imagens/files | 0-5 |
| Histórico | log de campos (3.B whitelist) | 5-30 |
| Tempo | time_entries da task | 0-15 |

| # | Campo (input de comment) | Tipo |
|---|---|---|
| 24 | Comentário | textarea + mention |
| 25 | Visível ao cliente no Portal | checkbox |

### 1.14 · Footer (sempre visível)

| Botão | Tom | Ação |
|---|---|---|
| arquivar | destrutivo macio | move pra arquivado (reversível) |
| excluir | destrutivo HARD | DELETE permanente |
| fechar | neutro | sai sem persistir edições inválidas (force) |
| salvar | primário verde | persist manual + fecha |

---

## 2. Problemas UX identificados

### 2.1 · Densidade vertical excessiva
- Total scroll ~1500-1800px no desktop
- Usuário perde contexto entre seções superiores e inferiores
- Sem indicador de progresso/posição

### 2.2 · Ordem questionável
- Esforço (campos críticos pra capacity) vem **depois** de Entrega
- Etapa (define todos os gates) fica no meio · deveria ser destaque
- Critério de aceite fica entre Descrição e Entrega · deveria ser próximo de Esforço (também gated em escopo_definido)

### 2.3 · Escopo gigante
- 3 sub-grupos com ~50% da tela vertical quando expandido
- Pouco editado (uma vez na definição) · ocupa real estate igual aos campos editados toda hora

### 2.4 · Footer perigoso
- `arquivar` (macio) · `excluir` (HARD) · `fechar` · `salvar` (verde) em sequência horizontal
- Distância visual entre destrutivo e construtivo é pequena
- Sem confirmação dupla pra excluir

### 2.5 · Gates dispersos sem visão agregada
- Asterisco vermelho em campos individuais funciona
- Mas **falta indicador agregado** "✓ pronto pra avançar" vs "⚠ 3 campos faltam"
- Usuário precisa scroll pra encontrar onde tá vermelho

### 2.6 · Right panel sem hierarquia
- 4 abas com peso visual igual (Conversa · Anexos · Histórico · Tempo)
- Conversa é claramente primária (5-10x mais usada) mas não tem dica visual disso
- Anexos vazio · Histórico volumoso (10+) · Tempo pouco usado

### 2.7 · Sem resumo no topo
- Quem é responsável · quando vence · status atual = dispersos
- Visão "summary card" no topo seria útil pra leitura rápida

### 2.8 · Campos do Bucket D (3.A · 3.B) competem com legacy
- 6 campos novos (Solicitada cliente · Critério aceite · Valor entregue · Solução · Bloqueada por · Motivo reabertura) somados aos legacy
- **Total visível: ~25 campos** · precisa organização forte de hierarquia

### 2.9 · Inconsistência de layout
- Algumas seções 2-col (Atribuição · Esforço) · outras full-width (Descrição · Critério · Entrega)
- Falta padrão claro de "quando dividir vs quando full"

### 2.10 · Mobile pós-Bucket D não auditado
- Modal mobile (entregue v1.03.104-115) tem 2 tabs Detalhes/Conversa
- Mas vários campos do 3.A/3.B foram adicionados sem revisar como aparecem no mobile

---

## 3. Diretrizes pra redesign

### 3.1 · Princípios
1. **Foco no que está sendo trabalhado agora** · campos relevantes à subetapa atual em destaque
2. **Hierarquia de 3 níveis** · primário (atribuição + entrega) · secundário (técnico) · avançado (audit)
3. **Indicador de prontidão agregado** · usuário sabe se pode avançar
4. **Footer com salvaguardas** · destrutivos isolados
5. **Right panel com prioridade visual** · Conversa em primeiro plano

### 3.2 · Sugestões de layout (opções pra claude-design avaliar)

#### Opção A · Tabs no form
```
┌─ Header: title + summary chip row ──────────┐
├─ Tab: [Detalhes] [Entrega] [Técnico] [Avançado] ─┤
├─ Conteúdo da tab ativa                  │ Right pane: │
│                                          │ Conversa    │
│                                          │ (Anexos)    │
│                                          │ (Hist)      │
│                                          │ (Tempo)     │
├─ Indicador "✓ pronto" / "⚠ N pendentes" ─┤
└─ Footer: [...] [×] [Salvar] ────────────┘
```

#### Opção B · Acordeão de seções colapsáveis
```
┌─ Header com summary chips                   ┐
├─ ▾ Atribuição (5 campos · 2col)            │ Right: │
├─ ▾ Descrição (2 textareas)                 │ tabs  │
├─ ▾ Entrega (condicional · 2 textareas)     │       │
├─ ▸ Critérios técnicos (esforço · escopo)   │       │
├─ ▸ Dependências e checklist                │       │
├─ ▸ Avançado (privacidade · histórico)      │       │
└─ Footer ───────────────────────────────────┘
```

#### Opção C · Sidebar de campos + main de conversa
```
┌─ Header + summary ──────────────────────────┐
├─ Lado A (40%): form │ Lado B (60%): Conversa
│ Atribuição          │ thread expandida      │
│ Descrição            │ comments grandes      │
│ ⚠ pendências         │ inline reply          │
│ + colapsa Técnico   │ tabs secundárias      │
└─ Footer ───────────────────────────────────┘
```
*Inverte foco — comunicação > formulário · útil pra tasks em andamento.*

#### Opção D · Coluna única vertical com summary fixo
```
┌─ Header fixo (sticky) ──────────────────────┐
│ summary: responsável · prazo · status       │
│ [⚠ 3 campos pendentes ↓]                    │
├─ Form (scroll) ─────────────────────────────┤
│ Atribuição                                   │
│ Descrição                                    │
│ Critérios                                    │
│ Técnico (colapsável)                         │
├─ Conversa (sticky bottom · sempre visível) ─┤
│ últimos 2 comments + input                  │
└─ Footer ────────────────────────────────────┘
```
*Estilo Linear/Notion · prioriza foco linear.*

### 3.3 · Constraints
- **Design System**: tokens DS já estabelecidos (verde editorial #007A3D · Inter · JetBrains Mono · radius var(--r-md) · etc)
- **Mobile**: modal full-screen com 2 tabs (Detalhes / Conversa) já entregue · qualquer redesign desktop precisa ter contrapartida mobile pensada
- **Realtime**: campos refletem mudanças via realtime · UI não pode "trancar" durante edição alheia (já tratado · só precisa não regredir)
- **Backwards-compat**: dados existentes não podem ser perdidos · só reorganização visual

### 3.4 · Critério de sucesso
- Reduzir scroll vertical de ~1700px pra <1000px (40%+ redução)
- Tempo pra encontrar "tudo o que falta preencher" <3s (com indicador agregado)
- Footer destrutivo isolado · zero clique acidental em excluir
- Conversa visível em qualquer momento do form · não precisa abrir tab

---

## 4. Recomendação · onde fazer o trabalho de design

### 4.1 · claude-design (skill `design:design-critique`)
**Recomendado se você quer**:
- Mockups visuais (HTML/CSS) das 4 opções pra comparar lado a lado
- Crítica estruturada com referências a princípios de design (Fitts · Hick · contraste)
- 2-3 iterações visuais antes de implementar

### 4.2 · Aqui mesmo (sessão atual)
**Recomendado se você quer**:
- Acesso direto ao código pra implementar a opção escolhida
- Contexto fresco do Bucket D e dos 25 campos atuais
- Validação live no Chrome após cada iteração

### 4.3 · Sugestão híbrida (eu recomendo)
1. **Hoje aqui** · gerar este brief (✅ feito) + escolher 1 ou 2 opções (A/B/C/D) que ressoam
2. **claude-design** · pegar este brief + os screenshots e gerar mockups visuais da(s) opção(ões) escolhida(s) · 2-3 iterações
3. **De volta aqui** · trazer o mockup final e implementar diretamente no código (modal task é 1 arquivo só · `task-modal.tsx`)

**Por quê** · este brief tem tudo que claude-design precisa (inventário · problemas · constraints · critério de sucesso) mas claude-design pode iterar visualmente muito mais rápido sem o overhead de "implementar pra validar". Quando o visual estiver decidido, implementar é mecânico aqui.

---

## 5. Próximos passos imediatos

1. **Você** · ler este doc · marcar qual(is) opção(ões) (A/B/C/D) faz mais sentido
2. **Você** · levar este `.md` + 4 screenshots pro claude-design
3. **claude-design** · iterar mockups visuais (~1-2 sessões)
4. **De volta aqui** · implementar mockup escolhido (~1-2 dias de código)
5. **Validar** · navegar no Chrome após implementação

---

## Apêndice · paths úteis

- Modal source: `src/components/task-modal.tsx` (~2700 linhas)
- DS tokens: `src/app/globals.css`
- Field validator: `src/lib/task-utils.ts` · `missingFieldsForCurrentSubetapa`
- Task type: `src/lib/types.ts` · `interface Task`
- Schema canônico DB: `supabase/schema.sql`
- Roadmap vivo: `docs/gestao/STATUS.md`
- Decisões de campo: `docs/gestao/DISCIPLINA_DADOS.md`
