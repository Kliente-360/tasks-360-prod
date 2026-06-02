# Brand assets — Kliente 360

Logo e mark da Kliente 360 em SVG e PNG, prontos pra uso em site, app, mídia social, slides, docs e materiais impressos.

Gerados pelo script [`scripts/export-brand-assets.mjs`](../../../scripts/export-brand-assets.mjs).
Para regenerar: `npm run export:brand`.

## Mark Aperture

Quatro círculos nas posições cardeais (N/E/S/W) com opacidade crescente em sentido horário a partir do topo: **0.45 → 0.65 → 0.85 → 1.0**. Forma pura, sem container. Cor sagrada: **#009900**.

| Arquivo | Uso |
|---|---|
| `mark-aperture.svg` | Verde sagrado #009900, fundo transparente — uso default |
| `mark-aperture-white.svg` | Branco, fundo transparente — fundos escuros |
| `mark-aperture-black.svg` | Preto monocromático — print B&W, fax, materiais sem cor |

PNGs em `mark-aperture/`, `mark-aperture-white/`, `mark-aperture-black/`. Tamanhos disponíveis: **16, 32, 48, 64, 128, 256, 512, 1024 px**. Todos quadrados, fundo transparente.

Tamanhos canônicos de uso:
- **16 px** — favicon
- **28 px** — nav do header
- **32–48 px** — avatar social, app icon mini
- **64–128 px** — assinatura de e-mail, watermark em slide
- **256–512 px** — apresentações, capas
- **1024 px** — print em alta resolução, hero web

## Lockup horizontal (mark + wordmark)

Mark à esquerda + wordmark "kliente 360" à direita, alinhamento baseline.

| Arquivo | Uso |
|---|---|
| `lockup-horizontal.svg` | Mark verde + texto preto — fundos claros |
| `lockup-horizontal-light.svg` | Mark verde + texto branco — fundos escuros |

PNGs em `lockup-horizontal/` e `lockup-horizontal-light/`. Tamanhos: **256, 512, 1024, 2048 px** (proporção 4.5:1).

> **Nota sobre SVG:** o `<text>` do lockup referencia a fonte Inter via `font-family`. Se o renderizador não tiver Inter instalada, usa fallback (system-ui / Helvetica). Para máxima portabilidade em mídia onde a fonte não está garantida (ex: documentos enviados pra cliente), prefira o PNG.

## Quando usar SVG vs PNG

| Contexto | Use |
|---|---|
| Web (Next.js, HTML, React) | SVG inline ou `<img src=".svg">` |
| Email (signature, marketing) | PNG (clientes mal renderizam SVG) |
| Slides (Keynote, PowerPoint, Google Slides) | PNG ou SVG (Keynote 13+ aceita SVG) |
| Documentos (Word, Pages, Docs) | PNG |
| Impressão profissional | SVG (vetor escala perfeito) |
| Favicon | SVG (`/favicon.svg`) com fallback PNG 32 |

## Regras de uso (resumo)

Detalhes completos no [styleguide](/styleguide.html#brand-rules) e em [DESIGN.md](../../../DESIGN.md#marca).

- ✅ Mark em verde sagrado #009900 em fundo claro; branco em fundo escuro
- ✅ Wordmark sempre lowercase com espaço — "kliente 360"
- ✅ Lockup horizontal por padrão (mark à esquerda do wordmark)
- ✅ Safe area = altura do mark (1×) ao redor
- ❌ Não recolorir o mark com cores de pilar (azul/âmbar/violeta)
- ❌ Não usar CAPS, "kliente360", hífen, itálico
- ❌ Não usar wordmark verde sobre fundo escuro (contraste fraco)
