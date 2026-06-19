# Modal de Task — Handoff de Redesign

> **Decisão:** Opção A híbrido (abas no formulário + resumo fixo + footer com salvaguardas).
> **Direção visual:** Editorial.
> **Mockup:** `Modal de Task.dc.html` (HTML+CSS inline, tokens 1:1 com o DS).
> **Meta:** scroll vertical ~1700px → < 850px · pendências visíveis em < 3s · footer destrutivo isolado.

---

## 1 · Decisão de layout

O modal acumulava duas naturezas num só scroll: um **formulário gated** (25 campos, obrigatoriedade por subetapa) e uma **superfície de colaboração** (Conversa). A solução separa os dois eixos — Conversa permanente no painel direito; formulário em abas curtas que cabem em < 850px sem scroll.

- **Hick-Hyman** — 25 campos simultâneos é o pior caso. Abas reduzem o conjunto visível por vez, sem esconder o pendente (badge por aba).
- **Fitts** — destrutivos (arquivar/excluir) afastados do Salvar, dentro de um menu `···`: distância + atrito por desenho.
- **Gestalt** — regiões nítidas (header · resumo · abas · conversa · footer) resolvem o layout inconsistente 2-col/full do modal atual.

Roubado da Opção D: o **resumo fixo** no topo. Roubado da Opção B: o **progressive disclosure** (badge de pendências por aba).

---

## 2 · Ordem final das seções

### Header (preto · `.tmodal-head`)
Título da task · indicador de autosave · botão fechar `×`. **Nada mais** — os chips desceram pro resumo; botão "copiar link" vai pro menu `···` ou é descartado.

### Subheader · resumo fixo (entre header e body)
Da esquerda pra direita:
1. **Status** — único editável; `<select>` das 11 subetapas (`SUB_LABELS`), estilizado como pill branca com bolinha verde + chevron.
2. **Cliente** (bolinha colorida) + **projeto** — read-only.
3. **Responsável** — avatar de iniciais + nome.
4. **Prioridade** — só o código (`P1`) em chip soft.
5. **Prazo** — mono.
6. **Alerta de prontidão** (à direita) — verde "pronto pra avançar" ↔ âmbar "N campos faltam", derivado de `missingFieldsForCurrentSubetapa`.

### Abas do formulário (coluna esquerda · badge de pendências por aba)
- **Detalhes** — Atribuição (`cliente`, `projeto`, `responsável`, `prioridade`, `prioridade_solicitada_cliente`) → Descrição (`descricao`, `valor_esperado`) → *[divisor]* `bloqueada_por_tasks` · `checklist` · `visivel_cliente` · `privada` · `external_id` (Integração SF).
- **Escopo & Esforço** — `complexidade` · `prazo` · `esforco` · `tempo_real_horas` → Escopo técnico (chips densos, sempre visível) → `criterio_aceite`.
- **Entrega** *(condicional, ≥ `em_homologacao` ou `concluido` ou reabertura)* — `solucao_implementada` · `valor_entregue`. Banner de `motivo_reabertura` quando aplicável.
- Aba **"Avançado" eliminada** (campos foram pro fim de Detalhes).
- Aba ativa default = a que contém a 1ª pendência da subetapa atual.

### Painel direito · Conversa (primária)
Conversa em destaque + Anexos · Histórico · Tempo secundários. Composer em **linha única** (input pill + botão circular de enviar) com o toggle "Visível ao cliente no Portal" numa linha fina abaixo — mais respiro pra thread.

### Footer · 2 zonas
- Esquerda: menu `···` com **arquivar** + **excluir** (confirmação dupla).
- Direita: **Fechar** + **Salvar**.
- O indicador de prontidão vive **só no resumo** (removido do footer).

### Banners contextuais (topo do formulário, independem da aba)
Erro de autosave (pulse · fechar bloqueado) · Bloqueado · Reabertura · Entrega aprovada.

---

## 3 · Hierarquia visual

| Elemento | Type | Cor / peso |
|---|---|---|
| Título (header) | 15.5px / 600 | `#fff` sobre `--bg-dark` |
| Status (resumo) | 12.5px / 600 | pill branca · bolinha `--green` |
| Label de campo | 11px / 600 · UPPER · `.07em` | `--fg-muted` |
| Valor / input | 13.5px / 400 | `--fg` · borda `--line-strong` |
| Metadata (prazo, h, IDs) | 11–12px · `--mono` | `--fg-muted` |
| Campo pendente | borda + asterisco | `--danger` + `box-shadow 0 0 0 1px` |

**Espaçamento:** seções do formulário separadas por `18–22px`; grid de 2 colunas com `gap 14px`; padding do painel `18px 22px`; raio dos campos `--r-sm (6px)`, dos cards/pills `--r-pill`.

---

## 4 · Micro-interações

Easing global `cubic-bezier(.2,.7,.2,1)` · duração `.15s` (hover) / `.24s` (transição). Nunca bounce, nunca scale.

- **Abas:** transição de cor + borda 150ms; ativa = sublinhado `--green` 2px. Badge (pill `--danger`) só quando há campo faltando naquela aba.
- **Alerta de prontidão:** verde + check (`--ok`) com 0 pendências ↔ âmbar + triângulo (`--warn`) com a contagem.
- **Autosave:** `salvo` (dot verde) · `salvando…` (pulse) · `erro` (chip vermelho cheio + pulse, e **fechar bloqueado** até corrigir).
- **Campo obrigatório vazio:** borda vermelha em tempo real (via `missingFieldsForCurrentSubetapa`) + asterisco no label.
- **Hover:** Salvar → `--green-hover`; Fechar → `--bg-alt`; campos/cards → borda `--line-strong`; translação sutil `-1px` em botões.
- **Footer destrutivo:** `···` abre popover; "excluir" troca o popover por confirmação ("Sim, excluir" / "Cancelar").
- **Conversa:** botão enviar = círculo verde (paper-plane); hover `--green-hover`. Atalho sugerido `⌘↵`.
- **Transição entre subetapas:** `validateSubetapaAdvance` roda antes de avançar; se faltar campo, toast bloqueia e a aba/badge aponta o pendente.

---

## 5 · Responsive

| Breakpoint | Comportamento |
|---|---|
| **≥ 1024px · Desktop** | Modal centralizado `1140px` · grid 2 colunas (formulário `1.42fr` / conversa `1fr`) · resumo fixo + abas. |
| **< 1024px · Mobile** | **Full-screen** com as 2 abas **Detalhes / Conversa** já entregues (v1.03.104-115). O resumo colapsa; abas internas viram acordeão dentro de Detalhes. **Sem regressão.** |

---

## 6 · Tokens do DS usados

Referência: `src/app/globals.css`. **Zero tokens novos** — tudo já existe no DS.

- **Marca / acento:** `--green` `--green-hover` `--green-soft` `--green-tint`
- **Texto / linhas / superfícies:** `--fg` `--fg-soft` `--fg-muted` `--line` `--line-soft` `--line-strong` `--bg` `--bg-alt` `--bg-app` `--bg-dark`
- **Status / prioridade:** `--p0/1/2/3 (+ -soft)` `--danger (+ -soft)` `--warn (+ -soft)` `--ok (+ -soft)`
- **Tipo · raio · sombra:** `--sans` (Inter) · `--mono` (JetBrains Mono) · `--r-sm/md/lg/pill` · `--sh-xs/sm/md/lg`

---

## 7 · O que NÃO muda (para não retrabalhar)

- **Schema do banco** — os 25 campos, nomes e tipos. Redesign é 100% reorganização visual.
- **Validators** — `validateSubetapaAdvance`, `missingFieldsForCurrentSubetapa`, `triageFailures` (em `task-utils.ts`) intactos.
- **Mobile** — modal full-screen 2 abas (Detalhes/Conversa) entregue em v1.03.104-115. Este redesign é desktop.
- **Realtime** — UI não tranca inputs durante edição alheia; sem mudança no channel.
- **Autosave + Salvar manual** e os **gates por subetapa** seguem idênticos.
- **Dark mode** — usa os mesmos `var(--*)`; nenhum valor hardcoded novo.
- **Conversa / Anexos / Histórico / Tempo** — mesma funcionalidade, só reorganizados.

---

## 8 · Melhorias futuras (fora do escopo)

Apareceram no processo — registradas para priorização, não implementar agora.

- Status no resumo dispara o gate de avanço inline (avançar subetapa direto do `<select>`, com validação).
- Persistir a aba ativa por subetapa (abrir já na aba mais relevante ao estado).
- Escopo técnico colapsável com resumo ("4 skills · editar") como alternativa à densidade, se virar ruído.
- Rótulos amigáveis de subetapa no Histórico em modo cliente (pendência V.4 do `AUDIT_RLS`).
- Preview inline de anexos + atalho `⌘↵` e picker de `@menção` no composer.
- Surfacing do botão "Aprovar entrega" também no modal interno (hoje só no Portal cliente).

---

*kliente 360 · conhecimento aplicado. Mockup interativo: `Modal de Task.dc.html` (ligue "Mostrar barra" nos Tweaks para percorrer os 8 estados).*
