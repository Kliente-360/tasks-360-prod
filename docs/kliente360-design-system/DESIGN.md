# Brand &amp; Design System — Kliente 360

> **Status: v1.0 (2026-05-25)** — guia definitivo. Use como padrão pra produto web, branding, mídias sociais, slides e docs internos. Reusável em outros apps (Next.js / Vercel ou qualquer stack web).
>
> **Para quem cria/edita páginas (humano ou agente)**: leia isto antes de inventar classes. Antes de criar `.meu-grid-novo` ou `.minha-card-bonita`, consulte se um primitivo + modificador resolve. Em 90% dos casos resolve.
>
> Arquivos de referência:
> - **Tokens** (cores, tipografia, espaços, etc.): `assets/css/tokens.css`
> - **Primitivos** (regras CSS): `assets/css/main.css`
> - **Reset** mínimo: `assets/css/reset.css`
> - **Showcase visual definitivo**: `/styleguide.html`

---

## Marca

A marca da Kliente 360 é composta por dois elementos canônicos:

### Mark Aperture

Quatro círculos nas posições cardeais (N/E/S/W de um quadrado 80×80), com opacidade crescente em sentido horário a partir do topo (0.45 → 0.65 → 0.85 → 1.0). Cor sagrada: **`--logo-green` #009900**.

```svg
<svg class="mark-aperture" viewBox="0 0 80 80" aria-hidden="true">
  <circle cx="40" cy="22" r="11"/>   <!-- topo,    opacity 0.45 -->
  <circle cx="58" cy="40" r="11"/>   <!-- direita, opacity 0.65 -->
  <circle cx="40" cy="58" r="11"/>   <!-- baixo,   opacity 0.85 -->
  <circle cx="22" cy="40" r="11"/>   <!-- esquerda, opacity 1.0 -->
</svg>
```

CSS reusável (em `main.css`):

```css
.mark-aperture circle { fill: var(--logo-green); }
.mark-aperture circle:nth-child(1) { opacity: 0.45; }
.mark-aperture circle:nth-child(2) { opacity: 0.65; }
.mark-aperture circle:nth-child(3) { opacity: 0.85; }
.mark-aperture circle:nth-child(4) { opacity: 1; }
```

Tamanho mínimo legível: **16px** (favicon). Abaixo disso o gradiente de opacidade vira borrão. Tamanhos canônicos no produto: **16 (favicon) / 28 (nav) / 48 (avatar) / 72-120 (hero)**.

### Wordmark

Texto **"kliente 360"** — lowercase, com espaço entre "kliente" e "360". Inter Bold ou Semibold dependendo do contexto. Letter-spacing tight/tighter.

### Lockup canônico

Mark à esquerda do wordmark, alinhamento baseline, gap = `--sp-3` (12px). Use o lockup horizontal por padrão em todos os contextos com largura suficiente. Versões empilhada e "mark isolado" só em contextos com restrição de espaço (avatar 32×32, favicon).

```html
<span class="brand-lockup">
  <svg class="mark-aperture" viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="22" r="11"/><circle cx="58" cy="40" r="11"/>
    <circle cx="40" cy="58" r="11"/><circle cx="22" cy="40" r="11"/>
  </svg>
  <span class="wordmark">kliente 360</span>
</span>
```

### Regras de uso

| ✅ Faça | ❌ Não faça |
|---|---|
| Mark em verde sagrado `#009900` em fundo claro | Recolorir o mark com cores de pilar (azul/âmbar/violeta) |
| Wordmark sempre **lowercase com espaço** | CAPS, "kliente360", hífen, itálico, stretching |
| Lockup horizontal (mark à esquerda do wordmark) | Separar mark e wordmark sem motivo |
| Em fundo escuro: mark verde + wordmark branco | Wordmark verde sobre fundo escuro (contraste fraco) |
| Safe area = altura do mark (1×) ao redor | Colar texto/ícone/borda dentro da safe area |

### Cores aplicadas ao mark/lockup

| Fundo | Mark | Wordmark |
|---|---|---|
| Branco / cinza claro (`--bg`, `--bg-alt`) | `--logo-green` #009900 | `--ink-900` |
| Preto / cinza escuro (`--bg-dark`) | `--logo-green` #009900 | branco |
| Navy (`--bg-deep` #06073E) | `--logo-green` #009900 | branco |
| Verde acento (`--color-accent`) | branco sólido | branco |

---

## Princípio

Cada página do site é composta de **primitivos**. Quando precisar de algo novo:

1. **Primeiro**: verifique se um primitivo existente cobre.
2. **Segundo**: verifique se um primitivo + modificador (`.section.alt`, `.card.accent-top`, etc.) cobre.
3. **Terceiro**: se realmente precisa de algo novo, **adicione o primitivo aqui** antes de usar — não copie/cole em uma página específica.

Anti-padrão clássico: criar `.pillar-card`, `.pp-offer-card`, `.cm-mode`, `.case-card` separados quando todos compartilham 90% da estrutura. Use `.card` + modificadores.

---

## Layout

### Container

Limita largura e adiciona padding lateral. Use sempre dentro de `<section>`.

```html
<div class="container">…</div>           <!-- 1200px max -->
<div class="container-narrow">…</div>    <!-- 820px max — corpo de leitura -->
```

### Section

Padding vertical (16/24/32 — 3 breakpoints). Adicione `<section class="section">` para qualquer seção horizontal do site.

| Classe | Uso | Padding-block |
|---|---|---|
| `.section` | Seção padrão de conteúdo | 16 / 24 / 32 |
| `.section.alt` | Fundo cinza claro (alternância) | 16 / 24 / 32 |
| `.section.dark` | Fundo preto, texto branco | 16 / 24 / 32 |
| `.section.hero` | Hero / landing intro (mais respiro) | 20 / 32 / 40 |
| `.section.cta` | CTA final (respiração generosa) | 24 / 32 / 40 |

Em modo `.dark`, eyebrow, `.lead` e `.muted` ajustam cor automaticamente.

```html
<section class="section alt">
  <div class="container">
    <header class="section-head">
      <span class="eyebrow">Portfólio</span>
      <h2 class="h2">Título da seção</h2>
      <p class="lead">Subtítulo opcional.</p>
    </header>
    …
  </div>
</section>
```

---

## Tipografia

### Headings

Use as classes utilitárias quando precisar do tamanho específico em qualquer contexto. Caso não use classe, o `<h2>` dentro de `.section-head` pega `--fs-h3` automaticamente.

| Classe | Tamanho (mobile → desktop) | Uso típico |
|---|---|---|
| `.display`, `.h1` | 48 → 96 px | Hero principal da home |
| `.h2` | 40 → 64 px | Sections grandes (home, CTAs finais) |
| `.h3` | 32 → 44 px | Section heads em páginas internas |
| `.h4` | 24 → 32 px | Card heads, subseções |

#### Acento editorial — verde em parte do heading

Padrão de assinatura visual da Kliente: o título do hero (e de aberturas fortes) tem duas partes — a primeira em tinta cheia, a segunda em verde `--color-accent`. É o gestual que sustenta a tagline canônica:

> Conhecimento aplicado, **_como serviço_**.

Implementação: envolver o trecho final em `<em>` e redefinir o estilo no escopo do hero.

```html
<h1>Conhecimento aplicado, <em>como serviço</em>.</h1>
```

```css
.hero h1 em { font-style: normal; color: var(--color-accent); }
```

Regras:

| ✅ Faça | ❌ Não faça |
|---|---|
| Apenas em H1 de hero, abertura de seção forte ou capa de slide | Múltiplos trechos verdes no mesmo heading |
| Apenas **1 trecho** verde por heading | Verde em H4, body ou caption (vira ruído) |
| Trecho coeso (2–5 palavras) | Verde em heading sobre fundo escuro — usar branco/suave |
| Tag semântica `<em>` (estilo redefinido pra normal + verde) | Trecho de 1 caractere ou frase inteira |

Em fundos escuros, o em vira branco (`var(--fg-on-dark)`) — verde sobre escuro perde contraste WCAG.

### Eyebrow

Linha de label acima do título. Cor padrão é UI green; modificadores ajustam por contexto.

| Classe | Uso |
|---|---|
| `.eyebrow` | Padrão (verde UI sobre fundo claro) |
| `.eyebrow.on-dark` | Sobre `.section.dark` (auto via cascata também) |
| `.eyebrow.on-color` | Sobre fundo da cor do pilar (branco translúcido) |
| `.eyebrow.pill` | Pílula tintada com a cor do pilar (em `[data-pillar]`) |

```html
<span class="eyebrow">Portfólio</span>
<span class="eyebrow on-color">Pilar · Salesforce</span>
<span class="eyebrow pill">Pilar 03 · IA</span>
```

### Body

- `.lead` — parágrafo grande pós-título (18→20px, cor muted, max-width 60ch)
- `.muted` — texto secundário
- `.mono` — JetBrains Mono (números, labels, IDs)

### Heading link

Link inline dentro de `<h1>/<h2>/<h3>` sem quebrar a tipografia. Cor herda, underline na cor accent.

```html
<h2>Três formas. A mesma <a class="heading-link" href="/#trilha">Trilha 360</a>.</h2>
```

---

## Componentes

### Card

Cartão base com padding, fundo branco, borda, hover sutil. Adicione modificadores para variantes.

```html
<article class="card">…</article>
<article class="card accent-top" data-pillar="sf">…</article>
<article class="card accent-side">…</article>
<a class="card linked" href="…">…</a>   <!-- com hover de link -->
```

| Modificador | Efeito |
|---|---|
| `.card.accent-top` | Borda superior 4px na cor do pilar (`var(--c-pillar)`) |
| `.card.accent-side` | Borda esquerda 3px, fundo `bg-alt`, sem borda nas demais |
| `.card.linked` | Cursor + hover de link (use em `<a class="card linked">`) |
| `.card.compact` | Mantém padding `sp-6` sempre (não expande no desktop) |

Cards **herdam a cor do pilar** se houver `[data-pillar]` em um ancestral. Padrão automático em pillar pages.

### Grid de cards

Em vez de criar `.minha-grid-de-cards-X-cols`, use:

| Classe | Comportamento |
|---|---|
| `.grid-cards` | 1 coluna sempre (default) |
| `.grid-cards.cols-2` | 1 → 2 colunas (≥768px) |
| `.grid-cards.cols-3` | 1 → 3 colunas (≥768px) |
| `.grid-cards.cols-2-3` | 1 → 2 → 3 (3 breakpoints; bom pra listas longas) |

```html
<div class="grid-cards cols-3">
  <article class="card accent-top" data-pillar="sf">…</article>
  …
</div>
```

### Stats strip

Faixa de números-âncora (KPIs declarados). Grid 2 → 4 colunas. Funciona sobre fundo claro ou escuro automaticamente.

```html
<section class="section dark">
  <div class="container">
    <div class="stats-strip">
      <div class="stat"><div class="num">3</div><div class="lbl">Pilares integrados</div></div>
      <div class="stat"><div class="num">2026</div><div class="lbl">Salesforce Partner</div></div>
      <div class="stat"><div class="num">100%</div><div class="lbl">Contas lideradas por sócio</div></div>
      <div class="stat"><div class="num">&lt;10</div><div class="lbl">Clientes estratégicos</div></div>
    </div>
  </div>
</section>
```

### Trilha 360 (horizontal compacta)

Use para a metodologia em home e pillar pages. Em pillar pages, herda a cor do pilar automaticamente nos números.

```html
<div class="trilha-wrap">
  <div class="trilha">
    <div class="trilha-step">
      <div class="num">01</div>
      <div class="verb">Mapear</div>
      <div class="desc">Onde a fricção mora.</div>
    </div>
    … 4 steps
  </div>
</div>
```

### Trilha timeline (vertical detalhada)

Variante usada na página comercial (`/como-trabalhamos/`) para detalhar etapas com entregável.

```html
<div class="trilha-timeline">
  <article class="step">
    <div class="num">01</div>
    <div>
      <h3>Mapear</h3>
      <p>Discovery profundo…</p>
      <div class="output"><strong>Saída</strong>Documento de escopo.</div>
    </div>
  </article>
  … 5 steps
</div>
```

### Botões

Sempre com `.btn`. Tamanho fixo (min-height 46px), borda invisível mas reservada (todos com mesma dimensão).

| Classe | Visual |
|---|---|
| `.btn.btn-primary` | Preto sólido com texto branco |
| `.btn.btn-accent` | Verde UI sólido com texto branco |
| `.btn.btn-ghost` | Transparente com borda cinza |
| `.btn.btn-on-dark` | Branco sólido (sobre fundo escuro) |
| `.btn.btn-ghost-dark` | Transparente com borda branca translúcida (sobre fundo escuro) |
| `.btn-link` | Link de texto verde com seta `→` |

```html
<a class="btn btn-primary" href="#">Falar com um sócio</a>
<a class="btn-link" href="#">Saiba mais</a>
```

### Pílulas

```html
<span class="pill pill-line">Salesforce Partner</span>
<span class="pill pill-accent pill-dot">Agentforce ready</span>
<span class="pill-pillar">Pilar 01 · Salesforce</span>   <!-- requer [data-pillar] no ancestral -->
```

### Section head

Header de seção. Use sempre `<header class="section-head">`.

```html
<header class="section-head">
  <span class="eyebrow">Eyebrow</span>
  <h2>Título da seção</h2>
  <p class="lead">Subtítulo opcional.</p>
</header>
```

Com ação à direita (link "Ver tudo"), automaticamente vira flex row via `:has()`:

```html
<header class="section-head">
  <div>
    <span class="eyebrow">Conteúdo</span>
    <h2>Nossa biblioteca</h2>
  </div>
  <a class="blog-link" href="/blog/">Ver todo o blog</a>
</header>
```

---

## Cor por pilar

Atributo `data-pillar` em qualquer ancestral expõe a CSS variable `--c-pillar`. Componentes (pílula, cards, eyebrow, trilha) leem essa variável automaticamente.

| Valor | Cor | Variável CSS |
|---|---|---|
| `sf` | Azul Salesforce | `--c-salesforce` (`#0B5394`) |
| `data` | Âmbar | `--c-data` (`#C9A227`) |
| `ai` | Violeta | `--c-ai` (`#6D28D9`) |

```html
<article class="pillar-page" data-pillar="sf">
  <!-- todos os filhos com --c-pillar = #0B5394 disponível -->
</article>
```

---

## Tokens de cor

Definidos em `tokens.css`. **Nunca hardcode hex em CSS de página**.

### Brand
- `--logo-green` (`#009900`) — só no wordmark/dots. Não usar em UI.
- `--color-accent` (`#007A3D`) — UI green editorial. CTAs, eyebrows, links, hover.
- `--color-accent-hover` (`#005C32`).
- `--color-accent-soft` (`#e8f5ec`) — pílulas e fundos suaves.

### Tinta e fundos
- `--ink-900 / 800 / 600 / 400 / 300` — preto e tons de cinza (escala Apple).
- `--bg` / `--bg-alt` — fundos primário/secundário (branco / cinza claro).
- `--bg-dark` (`#0a0a0a`) e `--bg-deep` (`#06073E`) — alternativos escuros.
- `--color-line` / `--line-strong` — bordas.

### Pilar
- `--c-salesforce / --c-data / --c-ai` — secundárias por pilar (base).
- `--c-salesforce-deep / --c-data-deep / --c-ai-deep` — variantes deep pra hover/emphasis.
- `--c-salesforce-soft / --c-data-soft / --c-ai-soft` — backgrounds tintados.
- `--c-data-darker` — variante extra-escura específica do âmbar (data hero em fundo escuro).
- `--c-ai-on-dark` (`#A78BFA`) — violeta clarito pra contraste WCAG AA em fundo escuro.

### Sobre fundo escuro

Tokens dedicados pra texto/linhas em `--bg-dark`, `--bg-deep` e `.section.dark`:

- `--fg-on-dark` / `--fg-on-dark-strong` / `--fg-on-dark-muted` / `--fg-on-dark-subtle` — texto branco com alpha variável.
- `--line-on-dark` / `--line-on-dark-hover` — bordas brancas com alpha.
- `--bg-on-dark-hover` — overlay branco translúcido pra hover de botões `.btn-ghost-dark`.

---

## Tokens de tipografia

- `--font-sans` = Inter, fallback system. **Única do site** (serif Fraunces foi descartado).
- `--font-mono` = JetBrains Mono.
- Escala fluida `--fs-12/14/16/18/20/24` (px fixos) e `--fs-h1/h2/h3/h4` (clamp).
- Pesos: `--fw-regular/medium/semibold/bold` (400/500/600/700).
- Letter-spacing: `--ls-tight/tighter/normal/wide`.
- Line-height: `--lh-tight/snug/normal/loose`.

---

## Tokens de espaço

Escala base 4: `--sp-1 (4px) / 2 (8) / 3 (12) / 4 (16) / 6 (24) / 8 (32) / 12 (48) / 16 (64) / 20 (80) / 24 (96) / 32 (128) / 40 (160)`.

Use sempre tokens. **Não escreva `padding: 24px`** — escreva `padding: var(--sp-6)`.

---

## Tokens de raio e sombra

- Raios: `--r-sm (6px) / md (10) / lg (16) / xl (24) / pill (999)`.
- Sombras: `--shadow-xs / sm / md / lg`.

---

## Decisões de copy embutidas no design

| Quero… | Use… |
|---|---|
| "Boutique" | NÃO. Use "consultoria especializada". |
| "Costurar / costura" | NÃO. Use "uma prática única" / "uma engrenagem". |
| "Ladainha" | NÃO. Use "clichês" / "jargão". |
| "IA & Aplicações" | NÃO. Use "IA Aplicada". |
| "Copilots" | Pode, mas prefira "agentes de IA". |
| Tableau como bandeira | NÃO. Expertise interna, não declarada como viés. |

Lista completa em `blog/posts/README.md` (seção Tom de voz).

---

## Anti-padrões — o que NÃO fazer

1. **Não crie nova classe se primitivo + modificador resolve.** Antes de `.minha-nova-card`, pergunte: `.card.X` resolve?
2. **Não hardcode cor.** Use `var(--…)` sempre.
3. **Não clampe `font-size` em rule de componente.** Use `var(--fs-h3)` ou similar.
4. **Não use serif (Fraunces).** O único uso foi descartado em Onda 2. Inter é a fonte única.
5. **Não use `style="…"` inline em produção** — sempre crie/use uma classe.
6. **Não duplique pattern visual entre páginas.** Se uma seção tem hero+stats+cards, use `.section.hero`, `.stats-strip`, `.grid-cards` + `.card` — não invente classes próprias.
7. **Não esqueça do mobile**. Toda regra novo precisa de mobile-first (cobrir 320px de largura).

---

## Decisão rápida — onde fica o quê

| Quero adicionar… | Coloque em… |
|---|---|
| Página nova | Diretório próprio na raiz (ex.: `/pricing/index.html`) |
| Post do blog | `blog/posts/<slug>.md` — segue `blog/posts/README.md` |
| Tradução | `<slug>.en.md` / `<slug>.es.md` no mesmo dir |
| Token novo (cor, espaço) | `assets/css/tokens.css` |
| Primitivo CSS novo | `assets/css/main.css` + atualizar este `DESIGN.md` |
| Classe específica de página | Pense 2x. Se for específica MESMO, comente o porquê. |

---

## Componentes app-specific (wrappers de página, não imitar fora do contexto)

Estes existem com nomes próprios porque cada um tem conteúdo único de página do site kliente360.com. Não tente abstrair — são casos legítimos de wrapper. **Em outro app, não copie estes — só os primitivos reutilizáveis acima.**

- `.hero` (home) — wrapper do hero principal com mark Aperture watermark.
- `.blog-hero`, `.cm-hero`, `.gloss-hero` — heros de seções específicas. Padding-block usa o sistema, mas têm H1 com max-width próprio.
- `.pp-hero` (pillar pages) — hero colorido full-bleed com número grande à esquerda.
- `.post-header` (blog post) — header com pílula + back-link.
- `.post-body` (blog post) — container narrow editorial.
- `.post-card` (blog) — card de post com pílula de pilar, data e link "Ler →".
- `.cm-faq` — accordion FAQ com `<details>` nativo.

Se uma página nova reusar **alguns** destes — ok. Se reusar **todos** — está repetindo a estrutura de blog ou pillar page e talvez não precisa de nome próprio.

---

## Reuso em outro app (Next.js / Vercel ou qualquer stack web)

O sistema é CSS vanilla — sem framework dependency. Funciona em Next.js, Vite, Remix, ou HTML estático.

### O que copiar (núcleo portável)

Três arquivos CSS auto-contidos:

```
app/styles/
├─ tokens.css     # cores, tipografia, espaço, raio, sombra, motion
├─ reset.css      # reset mínimo + box-sizing
└─ main.css       # primitivos (.card, .btn, .grid-cards, .pill, .stats-strip, .trilha, etc.)
```

Mais as fontes self-hosted:

```
public/fonts/
├─ inter-latin.woff2
└─ jetbrains-mono-latin.woff2
```

E o componente Mark (SVG inline):

```tsx
// components/Mark.tsx
export function Mark({ size = 32, className = "" }) {
  return (
    <svg
      className={`mark-aperture ${className}`}
      viewBox="0 0 80 80"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle cx="40" cy="22" r="11" />
      <circle cx="58" cy="40" r="11" />
      <circle cx="40" cy="58" r="11" />
      <circle cx="22" cy="40" r="11" />
    </svg>
  );
}
```

### O que NÃO copiar (app-specific)

Tudo em `main.css` abaixo da linha `/* ============ HERO ============ */` é específico do site institucional. Para outro app, comece só com BASE + LAYOUT PRIMITIVES + NAV + BUTTONS + PILLS + ACCESSIBILITY + MARK A + SECTION HEADER + STATS STRIP + GRID CARDS. O resto vem por demanda.

### Import order (Next.js `app/globals.css`)

```css
@import "./styles/tokens.css";   /* define vars — sempre primeiro */
@import "./styles/reset.css";    /* reset depois */
@import "./styles/main.css";     /* primitivos por último */
```

### Preload das fontes (Next.js `app/layout.tsx`)

```tsx
<head>
  <link
    rel="preload"
    href="/fonts/inter-latin.woff2"
    as="font"
    type="font/woff2"
    crossOrigin=""
  />
</head>
```

(Alternativa: `next/font/local` — resultado visual idêntico, com otimização automática.)

### Uso em JSX

CSS vars funcionam direto em `style` JSX:

```tsx
<button className="btn btn-primary">Falar com a gente</button>

<div style={{
  padding: "var(--sp-8)",
  background: "var(--color-accent-soft)",
  borderRadius: "var(--r-md)",
}}>
  …
</div>
```

Não precisa de Tailwind nem CSS-in-JS. Tokens via `var()` + classes de primitivos cobrem 95% dos casos.

---

## Brand application — além do produto web

O styleguide.html tem mocks visuais em `#brand-app`. Resumo das regras de aplicação:

| Canal | Tamanhos canônicos | Regras |
|---|---|---|
| **Instagram / LinkedIn feed** | 1080 × 1080 (quadrado), 1080 × 1350 (vertical) | Tese declarativa, mark inferior esquerdo, eyebrow categoria |
| **OG / LinkedIn link preview** | 1200 × 627 | Mesmo padrão do OG dinâmico do site (per-post) |
| **Story / Reels** | 1080 × 1920 | Mark + wordmark no topo, conteúdo centralizado |
| **Slide / keynote** | 16:9 widescreen | Inter, eyebrow + título grande, mark canto inferior esquerdo (18-24px), paginação em mono à direita. Fundos: branco (conteúdo), navy `--bg-deep` (capa/divisor), preto (citações), verde (CTA final) |
| **Documento** | A4 / Letter | Cabeçalho com mark + título do doc (Inter Bold) + data/versão (mono pequena). Corpo em Inter Regular, headings em Semibold |
| **Assinatura de e-mail** | n/a | Nome em Bold + cargo + lockup horizontal compacto + URL em mono. Sem ícones de redes sociais |

---

## Como agente novo deve começar

1. Leia este arquivo (DESIGN.md) inteiro — 10 minutos.
2. Leia `blog/posts/README.md` se for criar post.
3. Olhe `index.html` e `pilares/salesforce/index.html` como referência viva.
4. Para algo realmente novo, **adicione o primitivo em `main.css` + documente aqui** antes de usar.
