# Kliente 360 — Brand &amp; Design System

> **v1.0 · 2026-05-25**
>
> Porta de entrada pra quem está começando a usar o sistema visual da Kliente 360 fora deste repositório — em outro app web, slide, doc, mídia social ou material impresso.

---

## TL;DR — onde está cada coisa

| Quero… | Vou pra… |
|---|---|
| **Ver o sistema completo, visualmente** | [`/styleguide.html`](../styleguide.html) → ([live em kliente360.com/styleguide.html](https://kliente360.com/styleguide.html)) |
| **Ler a regra escrita por trás** | [`/DESIGN.md`](../DESIGN.md) |
| **Baixar logos (SVG + PNG em vários tamanhos)** | [`/assets/img/brand/`](../assets/img/brand/) — guia em [README](../assets/img/brand/README.md) |
| **Baixar fontes self-hosted** | [`/assets/fonts/`](../assets/fonts/) (Inter + JetBrains Mono em woff2) |
| **Copiar os tokens (cores, tipografia, etc.)** | [`/assets/css/tokens.css`](../assets/css/tokens.css) |
| **Copiar reset + primitivos CSS** | [`/assets/css/reset.css`](../assets/css/reset.css) + [`/assets/css/main.css`](../assets/css/main.css) |
| **Integrar tudo num projeto Next.js novo** | [Seção #nextjs do styleguide](https://kliente360.com/styleguide.html#nextjs) |
| **Aplicar a marca em mídia social, slides, docs** | [Seção #brand-app do styleguide](https://kliente360.com/styleguide.html#brand-app) |

---

## Quick start — adotar em outro projeto

### 1. Copie 3 arquivos CSS

Os tokens, reset e primitivos são auto-contidos. Sem dependência de framework.

```
seu-projeto/
└─ app/styles/   (ou src/styles/)
   ├─ tokens.css     # cores, tipografia, espaço, raio, sombra, motion
   ├─ reset.css      # reset mínimo + box-sizing
   └─ main.css       # primitivos (.card, .btn, .grid-cards, .pill, etc.)
```

URLs raw direto do GitHub:
- https://raw.githubusercontent.com/Kliente-360/website-kliente360/main/assets/css/tokens.css
- https://raw.githubusercontent.com/Kliente-360/website-kliente360/main/assets/css/reset.css
- https://raw.githubusercontent.com/Kliente-360/website-kliente360/main/assets/css/main.css

> **Em outro app, copie só os primitivos do `main.css`** (BASE até GRID CARDS, ~565 linhas). Tudo abaixo é específico do site institucional kliente360.com — não copie.

### 2. Copie as fontes (woff2)

```
seu-projeto/public/fonts/
├─ inter-latin.woff2
└─ jetbrains-mono-latin.woff2
```

URLs raw:
- https://raw.githubusercontent.com/Kliente-360/website-kliente360/main/assets/fonts/inter-latin.woff2
- https://raw.githubusercontent.com/Kliente-360/website-kliente360/main/assets/fonts/jetbrains-mono-latin.woff2

`tokens.css` já tem o `@font-face` apontando pra `/fonts/`. Ajuste o path se mudar de pasta.

### 3. Import no `globals.css`

Ordem importa: tokens primeiro (define `var(--...)`), reset depois, primitivos por último.

```css
@import "./styles/tokens.css";
@import "./styles/reset.css";
@import "./styles/main.css";
```

### 4. Componente Mark (SVG inline)

Mark é só forma, sem dependência de fonte. Cole num componente reutilizável.

```tsx
export function Mark({ size = 32, color = "#009900", ariaHidden = true }) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      aria-hidden={ariaHidden}
    >
      <circle cx="40" cy="22" r="11" fill={color} opacity="0.45" />
      <circle cx="58" cy="40" r="11" fill={color} opacity="0.65" />
      <circle cx="40" cy="58" r="11" fill={color} opacity="0.85" />
      <circle cx="22" cy="40" r="11" fill={color} />
    </svg>
  );
}
```

Ou baixe os SVGs prontos em [`/assets/img/brand/`](../assets/img/brand/).

### 5. Uso em JSX

Tokens via `var()` + classes de primitivos cobrem 95% dos casos.

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

Não precisa de Tailwind nem CSS-in-JS.

---

## Regras de marca — não-negociáveis

| ✅ Faça | ❌ Não faça |
|---|---|
| Mark em verde sagrado `#009900` em fundo claro | Recolorir o mark com cores de pilar (azul/âmbar/violeta) |
| Em fundo escuro: mark verde + wordmark branco | Wordmark verde sobre fundo escuro (contraste WCAG fraco) |
| Wordmark sempre **lowercase com espaço** — "kliente 360" | CAPS, "kliente360", hífen, itálico, stretching |
| Lockup horizontal por padrão (mark à esquerda) | Separar mark e wordmark sem motivo |
| Safe area = altura do mark (1×) ao redor | Colar texto/ícone/borda dentro da safe area |
| Acento verde via `<em>` em **1 trecho curto** do heading | Múltiplos trechos verdes; verde em H4/body/caption |

Detalhes completos: [`/styleguide.html#brand-rules`](https://kliente360.com/styleguide.html#brand-rules).

---

## Vocabulário — copy &amp; voz

Sistema visual também é sistema de palavras. O que **não usar** é tão importante quanto o que usar.

| Quero dizer… | Use… | Evite… |
|---|---|---|
| Posicionamento geral | "consultoria especializada" | "boutique" |
| Como entregamos | "uma prática única" / "uma engrenagem" | "costuramos", "jornada" |
| Pilar IA | "IA Aplicada" | "IA &amp; Aplicações" |
| Agente de software | "agentes de IA" | "copilots" |
| Genérico | termos diretos, técnicos | "transformação digital", "soluções inovadoras", "revolucionar" |

Lista completa: [`/DESIGN.md` §Decisões de copy](../DESIGN.md#decisões-de-copy-embutidas-no-design).

---

## Diretório do design system

```
website-kliente360/
├─ design-system/
│  └─ README.md             ← você está aqui
├─ styleguide.html          ← showcase visual público (kliente360.com/styleguide.html)
├─ DESIGN.md                ← companion narrativo técnico
├─ assets/
│  ├─ css/
│  │  ├─ tokens.css         ← design tokens canônicos
│  │  ├─ reset.css          ← reset mínimo
│  │  └─ main.css           ← primitivos (.card, .btn, .grid-cards, …)
│  ├─ fonts/
│  │  ├─ inter-latin.woff2  ← fonte única do sistema
│  │  └─ jetbrains-mono-latin.woff2
│  └─ img/brand/
│     ├─ README.md          ← guia dos arquivos de logo
│     ├─ mark-aperture.svg  ← mark canônico (verde sagrado)
│     ├─ mark-aperture-white.svg
│     ├─ mark-aperture-black.svg
│     ├─ lockup-horizontal.svg
│     ├─ lockup-horizontal-light.svg
│     └─ {mark-aperture,...}/{16,32,…,1024}.png   ← PNGs em 8 sizes
└─ scripts/
   └─ export-brand-assets.mjs   ← regenera os PNGs via @resvg/resvg-js
```

---

## Como manter o padrão (pra contribuidores)

1. **Antes de criar uma classe nova**, pergunte: um primitivo + modificador resolve? Em 90% dos casos, sim.
2. **Nunca hardcode cor.** Sempre `var(--color-*)` ou `var(--c-*)`.
3. **Nunca hardcode espaço.** Sempre `var(--sp-*)` da escala 4.
4. **Mudou um token?** Bump a versão em `tokens.css` no comentário do header e abra PR explicando.
5. **Mudou o `main.css`?** Atualize o `styleguide.html` pra refletir + uma linha no `DESIGN.md`.
6. **Adicionou um novo logo/asset?** Coloque em `/assets/img/brand/`, regenere PNGs com `npm run export:brand`, atualize o [README dos brand assets](../assets/img/brand/README.md).

Anti-padrões longos: [`/DESIGN.md` §Anti-padrões](../DESIGN.md#anti-padrões--o-que-não-fazer).

---

## Roadmap do sistema

| Já entregue (v1.0) | Próximas oportunidades |
|---|---|
| Tokens completos (cores + tipografia + espaço + raio + sombra + motion) | Pacote NPM publicado (`@kliente360/design-system`) |
| Primitivos CSS (~565 linhas portáveis) | Build de variantes (Tailwind preset, CSS Modules) |
| Logos SVG + PNG em 8 tamanhos × 3 variantes | Animações canônicas (motion tokens já estão em `tokens.css`) |
| Styleguide HTML standalone | Versão Figma do system |
| Guia Next.js integrado | Components React empacotados |
| Documentação narrativa (`DESIGN.md`) | Storybook |

Aberto a sugestões via issue: https://github.com/Kliente-360/website-kliente360/issues

---

## Licença

O sistema visual (tokens, primitivos CSS, mark Aperture) é propriedade da Kliente 360 — uso interno em projetos da Kliente e parceiros autorizados. Inter e JetBrains Mono são open-source (SIL Open Font License).
