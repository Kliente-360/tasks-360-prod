// Gera apple-touch-startup-image PNGs (1 por device iOS) em light + dark.
// Layout: réplica fiel do canto esquerdo do header do app:
//   k360-mark (4 dots verdes em diamante) + "tasks 360" em Plex Mono verde.
// Centralizado, discreto, sem texto extra.
//
// Pipeline: SVG → @resvg/resvg-js → PNG. Fonte passada via fontBuffers
// (resvg não carrega @font-face com data URL).
//
// Pré-requisitos:
//   npm install --no-save @resvg/resvg-js
//   curl -sL "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf" -o scripts/_plex-mono-400.ttf
//
// Roda com: node scripts/generate-splash.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const TEXT = 'tasks 360';

// Cores precisam casar EXATAMENTE com o background do <body> (var(--bg) =
// var(--surface-2) no globals.css). Se divergir, o iOS dispensa o splash
// e aparece uma cor ligeiramente diferente embaixo — flicker visível.
const LIGHT = {
  bg:    '#F1F2F0', // --surface-2 light
  brand: '#009900',
};
const DARK = {
  bg:    '#0A0C12', // --surface-2 dark
  brand: '#00B300', // --brand dark (mais clara pra contrastar)
};

const FONT_PATH = new URL('./_plex-mono-400.ttf', import.meta.url);
if (!existsSync(FONT_PATH)) {
  console.error('Falta IBM Plex Mono 400 em scripts/_plex-mono-400.ttf. Roda:');
  console.error('  curl -sL "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf" -o scripts/_plex-mono-400.ttf');
  process.exit(1);
}
const FONT_BUF = readFileSync(FONT_PATH);

function buildSvg(W, H, theme) {
  // Calibração: menor dimensão da tela define a escala da marca.
  const min = Math.min(W, H);
  const markSize       = Math.round(min * 0.075);
  const dotR           = markSize * 0.16;
  const markHalfOffset = markSize * 0.34;
  // "tasks 360" um pouco maior que "Carregando…" do gerador anterior —
  // queremos legível mas ainda discreto.
  const fontSize       = Math.round(min * 0.052);
  const gap            = Math.round(min * 0.032);

  // Plex Mono: ~0.6em por char + ajuste pra " " e dígitos.
  const textWidth  = TEXT.length * fontSize * 0.6;
  const totalWidth = markSize + gap + textWidth;

  const cx     = W / 2;
  const cy     = H / 2;
  const startX = cx - totalWidth / 2;
  const markCx = startX + markSize / 2;
  const textX  = startX + markSize + gap;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${theme.bg}"/>
  <g fill="${theme.brand}">
    <circle cx="${markCx}" cy="${cy - markHalfOffset}" r="${dotR}"/>
    <circle cx="${markCx - markHalfOffset}" cy="${cy}" r="${dotR}"/>
    <circle cx="${markCx + markHalfOffset}" cy="${cy}" r="${dotR}"/>
    <circle cx="${markCx}" cy="${cy + markHalfOffset}" r="${dotR}"/>
  </g>
  <text x="${textX}" y="${cy}"
        font-family="IBM Plex Mono"
        font-weight="400"
        font-size="${fontSize}"
        fill="${theme.brand}"
        text-anchor="start"
        dominant-baseline="middle">${TEXT}</text>
</svg>`;
}

function renderSplash(W, H, theme) {
  const svg = buildSvg(W, H, theme);
  const resvg = new Resvg(svg, {
    background: theme.bg,
    fitTo: { mode: 'width', value: W },
    font: {
      loadSystemFonts: false,
      fontBuffers: [FONT_BUF],
      defaultFontFamily: 'IBM Plex Mono',
    },
  });
  return resvg.render().asPng();
}

const DEVICES = [
  { w: 750,  h: 1334 },
  { w: 828,  h: 1792 },
  { w: 1125, h: 2436 },
  { w: 1170, h: 2532 },
  { w: 1179, h: 2556 },
  { w: 1284, h: 2778 },
  { w: 1290, h: 2796 },
  { w: 1668, h: 2388 },
  { w: 2048, h: 2732 },
];

const OUT_DIR = new URL('../public/assets/splash/', import.meta.url);
mkdirSync(OUT_DIR, { recursive: true });

for (const d of DEVICES) {
  // Light
  const lightPng = renderSplash(d.w, d.h, LIGHT);
  const lightPath = new URL(`./splash-${d.w}x${d.h}.png`, OUT_DIR);
  writeFileSync(lightPath, lightPng);
  // Dark
  const darkPng = renderSplash(d.w, d.h, DARK);
  const darkPath = new URL(`./splash-${d.w}x${d.h}-dark.png`, OUT_DIR);
  writeFileSync(darkPath, darkPng);
  console.log(`✓ ${d.w}x${d.h} (light ${(lightPng.length/1024).toFixed(0)} KB · dark ${(darkPng.length/1024).toFixed(0)} KB)`);
}
console.log(`\nGerados ${DEVICES.length * 2} splashes em public/assets/splash/`);
