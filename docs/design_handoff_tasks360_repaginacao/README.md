# Handoff — Repaginação tasks 360 (Design System Kliente 360)

> **Para o desenvolvedor (Claude Code):** este pacote documenta a repaginação completa do app **tasks 360**, alinhando-o ao **Design System Kliente 360**. O objetivo é padronizar TODAS as telas com um conjunto único de componentes, tokens e padrões — não é um app novo, é a evolução do app existente.

---

## 0. O que são os arquivos deste pacote

- `prototype/tasks 360 hi-fi.html` + `prototype/hifi/*` — **protótipo hi-fi em React/JSX (Babel no browser)**. É **referência de design**, não código de produção. Mostra a aparência e o comportamento finais com tokens, cores e tipografia reais. **Recrie estes padrões na stack real do repo (Next.js + React + Tailwind + CSS custom em `globals.css`)**, usando os componentes e convenções que já existem lá.
- `wireframes/Padrao tasks 360.html` + `wireframes/wf.css` — **doc lo-fi** que fechou as decisões de padrão (as 3 variações de cada âncora e a recomendada). Use como referência das decisões; a fonte da verdade visual é o hi-fi.

**Fidelidade:** o protótipo é **hi-fi** — recrie pixel-a-pixel usando os tokens abaixo. Os wireframes são **lo-fi** (só contexto de decisão).

---

## 1. Contexto do repositório-alvo

Stack atual (já existente no repo `tasks-360-prod`):
- **Next.js (App Router)** + **TypeScript** + **Tailwind** + CSS custom em `src/app/globals.css`.
- **Supabase** (data + auth). A lógica de dados/mutators **não muda** — isto é uma camada de **UI/UX e design system**.
- Telas em `src/app/(app)/<tela>/<tela>-client.tsx`; shell em `src/components/app-nav.tsx` + `src/app/(app)/layout.tsx`.

### Princípio da migração
1. **Primeiro os tokens** (`globals.css`) — muda a cara de tudo de uma vez.
2. **Depois os componentes compartilhados** novos (`PageHeader`, `FilterBar`, `MoreMenu`, `PillsFilter`) + o `TimerButton` no header.
3. **Por fim, tela a tela**, trocando os headers/filtros locais pelos componentes compartilhados. As tabelas, modais e KPIs já existem — só re-skin + padronização da anatomia.

---

## 2. A grande mudança de marca (tokens)

O `globals.css` atual diverge do DS oficial. **Corrigir:**

| O que | Hoje (errado) | Novo (DS oficial) |
|---|---|---|
| Fonte sans | IBM Plex Sans | **Inter** |
| Fonte mono | IBM Plex Mono | **JetBrains Mono** |
| Verde de CTA/link/ativo | `#009900` (sagrado) | **`#007A3D`** (editorial) |
| `#009900` | em botões | **só** no símbolo aperture |

> **Regra P0:** `#009900` (`--logo-green`) aparece **apenas** dentro do símbolo de 4 círculos (a "aperture"). Todo CTA, link, aba ativa, foco e hover usa o verde editorial `#007A3D`. Misturar os dois é violação de marca.

### Token set novo (substituir o `:root` de `globals.css`)
Valores exatos usados no hi-fi (`prototype/hifi/app.css`). São a base candidata pro `globals.css`:

```css
:root{
  /* marca */
  --green:#007A3D; --green-hover:#00692F; --green-soft:#E7F1EA; --green-tint:#F2F8F4;
  --logo-green:#009900;            /* SÓ o símbolo */
  /* neutros */
  --fg:#0E1116; --fg-soft:#3A3F46; --fg-muted:#6B7178;
  --line:#E7E6E1; --line-soft:#F0EFEA; --line-strong:#D6D4CC;
  /* superfícies */
  --bg:#FFFFFF; --bg-alt:#F5F5F2; --bg-app:#F7F7F4; --bg-dark:#0E1320; --bg-portal:#0A3A1F;
  /* status / prioridade */
  --p0:#C0392B; --p0-soft:#FBECEA; --p1:#B7791F; --p1-soft:#FAF1E0;
  --p2:#2C72B8; --p2-soft:#EAF2FA; --p3:#7D8185; --p3-soft:#F1F1EE;
  --danger:#C0392B; --danger-soft:#FBECEA; --warn:#B7791F; --warn-soft:#FAF1E0;
  --ok:#1E8A4C; --ok-soft:#E7F1EA;
  /* tipo */
  --sans:'Inter',system-ui,-apple-system,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,monospace;
  /* raio */
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-xl:24px; --r-pill:999px;
  /* sombra (Apple-sutil) */
  --sh-xs:0 1px 2px rgba(16,19,22,.05);
  --sh-sm:0 2px 8px rgba(16,19,22,.06);
  --sh-md:0 8px 24px rgba(16,19,22,.08);
  --sh-lg:0 24px 56px rgba(16,19,22,.14);
  /* movimento */
  --ease:cubic-bezier(.2,.7,.2,1); --dur:.15s;
  --container:1320px;
}
```

- Carregar Inter + JetBrains Mono (via `next/font` ou os `.woff2` do brand-kit). Latin cobre PT/EN/ES.
- **Tipografia:** Inter 700 em títulos (tracking `-0.025em`); corpo 14–16px; **mono** em números, datas, eyebrows, IDs (`font-feature-settings:"tnum"`).
- **A regra verde-em:** 1 trecho do título forte em `<em>` (sem itálico) pinta `--green`. Um por heading.
- **Sem gradiente.** Fundos chapados; neutros dominam; preto/navy só pontual (header de modal, portal).
- **Sombra:** cards repousam sem sombra, sobem pra `--sh-md` no hover (`translateY(-2px)`).
- Dark mode: manter a estrutura `.dark` existente, recalibrando os mesmos tokens (fora do escopo deste hi-fi, que é light-first).

### Ícones
- Adotar **Lucide** (traço 2px, `stroke-linecap round`, viewBox 0 0 24 24). **Remover todos os emoji** (🤖 🔒 ▾ ✕ ⋯) e glifos do produto.
- Estados "criada por IA" e "privada" viram **chip/ícone** do set (ex.: `tag-ai` com ícone `refresh`), nunca emoji.
- O conjunto exato usado está em `prototype/hifi/icons.jsx` (mapa nome→paths). Pode trocar por `lucide-react` no repo real (mesmos nomes na maioria).

---

## 3. Componentes compartilhados NOVOS (criar)

Estes são o coração da padronização. Implementar como componentes React reais (sugestão de caminho em `src/components/`). Specs e código de referência em `prototype/hifi/`.

### 3.1 `PageHeader` — header interno de cada tela (uma linha)
Arquivo de ref: `prototype/hifi/filterbar.jsx` (`PageHeader`).

**Anatomia (uma linha, `flex` + `justify-between`, `flex-wrap` no mobile):**
- Esquerda (`.ph-left`): bloco de título (`h1` clamp 21→26px, 700, `-0.025em`) + subtítulo/contexto/métrica rápida (`.narr`, 12.5px, muted, com `<b>` nos números). Opcionalmente um `titleAside` **ao lado do título** (setas do calendário, toggle Macro/Op do kanban).
- Direita (`.ph-right`): o slot de controles — normalmente a `FilterBar`, ou `PillsFilter` (Foco/Triagem), ou nada.
- **Sem botão de ação aqui.** Criar tarefa, exportar etc. NÃO ficam neste header (ver §4 e §3.4).

```jsx
<PageHeader
  title="Backlog"
  context={<><b>128</b> abertas · <b>14</b> atrasadas · <b>312h</b></>}
  titleAside={/* opcional: setas/toggle */}
  right={<FilterBar .../>}
/>
```

> Substitui o `.page-bar` atual e todos os headers locais inconsistentes das telas.

### 3.2 `FilterBar` — componente ÚNICO e reutilizável  ⭐ (pedido central)
Arquivo de ref: `prototype/hifi/filterbar.jsx` (`FilterBar`, `FilterSelect`, `matchFilters`).

Usado em **Backlog, Kanban, Calendário, Dashboard e Timesheet**. Gramática fixa, sempre nesta ordem:

`[ Buscar ] [ Cliente ] [ Projeto ] [ Responsável ] [ Prazo ] [ Limpar(n) ] [ ⋯ ]`

- **Buscar** = input que filtra **TODOS os campos** (título, cliente, projeto, responsável, tags) — não só o título. Predicado em `matchFilters(task, f)`.
- **Cliente / Projeto / Responsável / Prazo** = `FilterSelect` com **popover real** (lista de opções + "Todos" pra limpar; fecha no clique-fora via `useClickAway`). Quando tem valor: fica **verde** (`.fselect.on`, borda+fundo `--green`).
  - Opções vêm dos dados: clientes, projetos, pessoas; Prazo = `Atrasadas / Hoje / Esta semana / Sem prazo`.
- **Limpar (n)** aparece quando há filtros ativos (`countActive(f)`); zera tudo.
- **⋯** = `MoreMenu` (ver 3.3) sempre no fim.
- Prop `show` controla quais selects aparecem por tela (ex.: Timesheet usa `['cliente','resp']`).
- Estado por tela via hook `useFilters()` → `{ f, set, clear }` (objeto `{q,cliente,projeto,resp,prazo}`).

**Importante:** as telas aplicam o **mesmo predicado** `matchFilters` à sua coleção. No repo real, isso vira um util compartilhado (ex.: `lib/filters.ts`) que recebe a `Task` e o objeto de filtros.

```ts
function matchFilters(t, f){
  if(f.q){ const q=f.q.toLowerCase();
    const hay=[t.titulo,clienteNome,projetoNome,pessoaNome,(t.tags||[]).join(' ')].join(' ').toLowerCase();
    if(!hay.includes(q)) return false; }
  if(f.cliente && t.clienteId!==f.cliente) return false;   // adaptar p/ ids do repo
  if(f.projeto && t.projetoId!==f.projeto) return false;
  if(f.resp && t.pessoaId!==f.resp) return false;
  if(f.prazo==='atrasadas' && !atrasada(t)) return false;
  /* hoje / semana / sem prazo conforme regra de prazo do repo */
  return true;
}
```
> No protótipo os campos são strings (nomes); **no repo, usar os IDs** (`clienteId`, `projetoId`, `pessoaId`) e os helpers existentes (`atrasada`, `agingLevel`, etc. em `lib/task-utils`).

### 3.3 `MoreMenu` (o ⋯) — padrão, com itens desabilitáveis por contexto
Arquivo de ref: `prototype/hifi/filterbar.jsx` (`MoreMenu`).

Menu popover (clique-fora fecha). Itens podem ser `toggle` (com mini-switch) ou `action`. Cada item tem `enabled` — quando `false`, aparece **desabilitado/acinzentado** (não some).

Itens padrão e enablement por tela:

| Item | Backlog | Kanban | Dashboard | Calendário | Timesheet |
|---|---|---|---|---|---|
| Agrupar (cicla Cliente→Responsável) | ✅ | ⛔ (já é por status) | ⛔ | ⛔ | ⛔ |
| Mostrar arquivadas (toggle) | ✅ | ✅ | ⛔ | ✅ | ⛔ |
| Somente criadas por IA (toggle) | ✅ | ✅ | ✅ | ✅ | ⛔ |
| Exportar CSV (action) | ✅ | ✅ | ✅ | ✅ | ✅ |

> **Backlog mantém os três** (Agrupar / Arquivadas / IA), como pedido. As demais abas mostram o mesmo menu, desabilitando o que não se aplica.

### 3.4 `PillsFilter` — para Foco e Triagem
Arquivo de ref: `prototype/hifi/filterbar.jsx` (`PillsFilter`).

No lugar da `FilterBar`, **Foco** e **Triagem** usam pills (segmented) no `right` do `PageHeader`, com contadores:
- **Foco:** `Minhas · Atrasadas · Hoje`.
- **Triagem:** `Todos · Cliente respondeu · Criadas por IA · Sem responsável`.
- Pill ativa = `--green-soft` + borda verde. Contador em mono.

---

## 4. Header do app (shell) — `src/components/app-nav.tsx`

Ref visual: `prototype/hifi/app.jsx` (`App` header) + `app.css` (`.hdr`, `.timer-btn`).

Refinar o header existente (mantém topo + abas):
- **Frosted glass:** `background:rgba(255,255,255,.8); backdrop-filter:saturate(180%) blur(20px); border-bottom:1px solid var(--line)`.
- **Símbolo aperture** com **opacidade gradiente** (4 círculos: .45 / .65 / .85 / 1.0) — ver `.mark` no `app.css`. Hoje os 4 pontos são opacos iguais; corrigir.
- **Clusters de ação** separados por divisória (`.hdr-sep`):
  `[ Cronômetro ] | [ Exportar · Ajuda · Tema ] | [ + Tarefa · Sino · Avatar ]`
- **Abas:** ativa em **verde editorial** + sublinhado 2px; resto neutro. Ícone Lucide por aba (dashboard=grid, backlog=list, kanban=columns, foco=target, triagem=inbox, calendário=calendar, briefing=file, timesheet=**timer/cronômetro**, portal=building, cadastros=sliders).
- **Versão (`v1.02.xxx`) sai do header** → menu do avatar/rodapé.

### 4.1 Cronômetro (`src/components/timer-button.tsx`, já existe — evoluir)
Ref: `prototype/hifi/app.jsx` (`Cronometro`) + `.timer-btn` no `app.css`.
- É **um botão pill no header** que **mostra o tempo corrido** (`HH:MM:SS`, mono) **e** é o start/stop.
- Parado: ícone `play`, neutro. Rodando: ícone `square` (stop), pill **verde** (`--green-soft`) com dot pulsando.
- No repo, ligar ao `TimerProvider`/`use-timer` já existente (tempo real + persistência). O ícone de cronômetro (stopwatch Lucide `timer`) é o mesmo da aba Timesheet.

---

## 5. Componentes existentes — re-skin + padronização da anatomia

Estes já existem no repo; aplicar tokens novos e padronizar. Specs no `app.css`.

### 5.1 Tabela (`.tbl`) — usar em Backlog, Timesheet, Cadastros, Portal
- Header `th`: **mono 10px UPPER**, tracking .08em, muted, fundo `--bg-alt`, borda inferior `--line-strong`. Clicável quando ordenável (`.sortable`), com ícone de sort que vira **seta verde** na coluna ativa (`SortTh`: `sort`→`arrow-up`/`arrow-down`).
- Linha `td`: altura **52px** (densa mas toque-safe), borda `--line-soft`, hover `--bg-alt`, clique abre modal. Selecionada = `--green-tint`.
- Seleção em massa: checkbox custom (`.cbx`, marcado = verde). Quando há seleção, **bulk bar** flutuante embaixo (navy `--bg-dark`, pill) com Atribuir/Prioridade/Prazo + fechar.
- **Agrupado** (quando "Agrupar" ativo): faixa de grupo (`.grp`) com chevron + contagem + soma de horas em mono. Mesma linha.
- **Mobile:** a tabela vira cards (anatomia: título + pri no topo; responsável + prazo embaixo).

### 5.2 KPI (`.kpi`) — unificar Dashboard e Portal num componente só
- Label mono 10px UPPER; valor 30px 700 tabular; delta mono opcional (verde quando positivo).
- Neutro por padrão; `.danger` (borda + valor vermelho) só pra métrica de risco (ex.: Atrasadas, Aguardando você).
- **Dashboard:** KPIs e a tabela "Precisa de atenção" **reagem aos filtros**. **Throughput (12 semanas)** e **Carga por pessoa** são **globais** — marcar com tag `não filtrado` (`.tag-global`) e NÃO aplicar o filtro.

### 5.3 Botões (`.btn`) — todos pills
- Hierarquia: `primary` (verde, 1 por contexto) · secundário (linha) · `ghost` · `danger` (vermelho só no texto/ícone). Hover sobe −1px. Foco-visível = halo verde 2px.
- `IconBtn` (32–34px) pra ações de ícone no header e linhas.

### 5.4 Chips
- `Pri` (P0–P3, mono, dot semafórico), `StatusChip` (dot por estado), `tag-ai`, `chip`/`chip.green`. Cores em §2.

### 5.5 Modais (`src/components/task-modal.tsx`, `cadastros/*-modal.tsx`)
Ref: `prototype/hifi/modals.jsx` + `.modal*` no `app.css`.
- **Task modal:** 2 colunas (form à esquerda 1.35fr / atividade à direita 1fr). Header escuro `--bg-dark` com breadcrumb (mono) + título editável + chip de prioridade + **autosave verde** ("● salvo") + fechar. Abas no painel direito (Comentários/Anexos/Log). Footer: hint `⌘↵` + Excluir/Fechar/Salvar. Mobile: 1 coluna (esconde painel direito).
- **Cadastro (cliente/projeto/pessoa):** modal estreito (520px), 1 coluna, header **verde-escuro** `--bg-portal` com ícone do contexto, mesmo footer. Labels mono UPPER; inputs raio 10px; **foco verde** (`--green` + halo `--green-soft`); estado de erro vermelho + mensagem.

---

## 6. Telas — mapa de arquivos e mudanças

| Tela | Arquivo no repo | Mudanças |
|---|---|---|
| Shell | `src/components/app-nav.tsx` | §4: clusters, aperture, abas verdes, cronômetro, ícones |
| Dashboard | `src/app/(app)/dashboard/dashboard-client.tsx` | `PageHeader` + `FilterBar`; KPIs/atenção filtram; Throughput+Carga globais (`não filtrado`) |
| Backlog | `src/app/(app)/backlog/backlog-client.tsx` | `PageHeader`+`FilterBar` (substitui page-bar + selects soltos + menu ⋯ atual); ⋯ = Agrupar/Arquivadas/IA; tabela §5.1 |
| Kanban | `src/app/(app)/kanban/kanban-client.tsx` | `PageHeader` com toggle Macro/Operação **ao lado do título**; `FilterBar` à direita; colunas com borda-topo por status |
| Calendário | `src/app/(app)/calendario/calendario-client.tsx` | Setas ‹ › **ao lado do mês (título)**; `FilterBar`; **status = código de cor** em cada bloco do dia + legenda |
| Foco | `src/app/(app)/foco/foco-client.tsx` | `PageHeader` + `PillsFilter` (Minhas/Atrasadas/Hoje) |
| Triagem | `src/app/(app)/triagem/triagem-client.tsx` | `PageHeader` + `PillsFilter` (Todos/Cliente respondeu/IA/Sem responsável) |
| Timesheet | `src/app/(app)/timesheet/page.tsx` | **Incluir `FilterBar`** (`show=['cliente','resp']`) + tabela §5.1 |
| Briefing | `src/app/(app)/briefing/briefing-client.tsx` | Re-skin editorial (container 820px, eyebrow, verde-em); mantém ação Salvar/Exportar (não é aba de filtro) |
| Portal | `src/app/(app)/portal/portal-client.tsx` | Header `--bg-portal`; KPIs unificados (§5.2); alertas semafóricos |
| Cadastros | `src/app/(app)/cadastros/*` | Subtabs (Clientes/Projetos/Pessoas) + tabela §5.1; modais §5.5; mantém ação "+ Cliente" (CRUD, não é aba de filtro) |

> **Abas que aplicam filtro:** Backlog, Kanban, Calendário, Dashboard, Timesheet → `FilterBar` + ⋯. **Foco/Triagem** → pills. **Briefing/Portal/Cadastros** → sem `FilterBar` (não são listas filtráveis no mesmo sentido).

---

## 7. Interações & comportamento

- **Filtros:** mudança reflete imediatamente (client-side sobre a store em memória já existente). Filtro ativo = verde; `Limpar(n)` zera. Popover fecha no clique-fora e ao selecionar.
- **Ordenação:** clique no header cicla asc→desc; seta verde na coluna ativa. (Manter o sort encadeado já existente no Backlog se desejado.)
- **⋯ Agrupar:** cicla nenhum→Cliente→Responsável (Backlog); colapsar grupos por clique na faixa.
- **Cronômetro:** clique alterna start/stop; tempo corre em tempo real; persistir (já há `use-timer`).
- **Calendário:** ‹ › trocam mês; clique no dia abre lista/tarefas; cor do bloco = status (verde andamento, vermelho bloqueado/atrasado, neutro backlog, riscado concluído).
- **Movimento:** 150ms ease-out; cards sobem 2px no hover; sem bounce; sem fade-on-load.
- **Responsivo:** `PageHeader` empilha (controles full-width) < 860px; kanban 2 col; modal vira 1 coluna.

---

## 8. Design tokens (resumo)
Ver bloco completo em §2 e em `prototype/hifi/app.css` (`:root`). Cores principais: verde editorial `#007A3D`, logo `#009900` (só símbolo), neutros `#0E1116`/`#6B7178`/`#E7E6E1`, superfícies `#FFFFFF`/`#F5F5F2`/`#F7F7F4`, status P0 `#C0392B` / P1 `#B7791F` / P2 `#2C72B8` / P3 `#7D8185`. Raio 6/10/16/999. Sombras low-alpha em 4 níveis. Fontes Inter + JetBrains Mono.

## 9. Assets
- Sem fotos/ilustrações (o DS é anti-ilustração). Símbolo aperture desenhado em CSS (4 círculos com opacidade gradiente) — ver `.mark`.
- Ícones: Lucide (`lucide-react` no repo). Mapa de referência em `prototype/hifi/icons.jsx`.
- Fontes: Inter + JetBrains Mono (Google Fonts ou `.woff2` do brand-kit Kliente 360, latin).

## 10. Arquivos deste pacote
- `screenshots/` — capturas das 10 telas (01–10). Os **modais** (task + cadastro) não estão como imagem estática (limitação de captura), mas estão descritos em detalhe na §5.5 e podem ser vistos ao vivo: abra o protótipo e clique numa linha da tabela (modal de tarefa) ou em "+ Cliente" nos Cadastros. Atalhos de deep-link: `…hi-fi.html#modal` abre o modal de tarefa; `#novocliente` abre o de cadastro; `#backlog`, `#kanban`, etc. abrem a aba direto.
- `prototype/tasks 360 hi-fi.html` — host do protótipo (abrir no navegador pra ver tudo funcionando).
- `prototype/hifi/app.css` — **tokens + todos os estilos de componente** (base do `globals.css`).
- `prototype/hifi/icons.jsx` — set de ícones.
- `prototype/hifi/ui.jsx` — primitivos (Mark, Btn, IconBtn, Seg, Search, Pri, StatusChip, Avatar, Kpi, SortTh, Checkbox, PageBar).
- `prototype/hifi/filterbar.jsx` — **FilterBar, FilterSelect, MoreMenu, PillsFilter, PageHeader, useFilters, matchFilters** (o núcleo da padronização).
- `prototype/hifi/data.jsx` — dados mock (substituir pela store real).
- `prototype/hifi/screens1.jsx` — Dashboard, Backlog, Kanban.
- `prototype/hifi/screens2.jsx` — Cadastros, Portal, Foco, Triagem, Calendário, Briefing, Timesheet.
- `prototype/hifi/modals.jsx` — TaskModal, ClienteModal.
- `prototype/hifi/app.jsx` — shell (header + abas + cronômetro + estado dos modais).
- `wireframes/Padrao tasks 360.html` + `wireframes/wf.css` — doc lo-fi das decisões (3 variações por padrão).

## 11. Ordem sugerida de execução (para o Claude Code)
1. Trocar tokens + fontes em `globals.css` (§2). Ver o app inteiro mudar de cara.
2. Criar `PageHeader`, `FilterBar` (+`FilterSelect`,`MoreMenu`,`PillsFilter`,`useFilters`) e o util `matchFilters` com **IDs reais** (§3).
3. Refinar `app-nav.tsx` + cronômetro (§4).
4. Migrar Backlog (a tela mais completa) — vira o gabarito. Depois Kanban, Calendário, Dashboard, Timesheet (§6).
5. Foco/Triagem com pills. Re-skin de Portal, Briefing, Cadastros, modais (§5.5).
6. Dark mode (recalibrar tokens `.dark`).
7. QA: consistência entre telas (mesmo header, mesma FilterBar, mesmos chips), foco/teclado, mobile.
```
