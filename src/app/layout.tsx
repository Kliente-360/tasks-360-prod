import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'tasks 360',
  description: 'Gestão de backlog · Kliente 360',
  applicationName: 'tasks 360',
  manifest: '/manifest.webmanifest',
  // Apple-specific PWA meta — Next gera as meta tags certas.
  appleWebApp: {
    capable: true,
    title: 'tasks 360',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  // Favicon do browser: SVG (vetorial, escala bem) + PNG fallback pro
  // Chrome / Safari que às vezes preferem raster. apple-touch-icon usa
  // a versão badge verde (PWA install iOS). PNGs do PWA Android são
  // lidos do manifest.webmanifest.
  icons: {
    icon: [
      { url: '/assets/icon.svg', type: 'image/svg+xml' },
      { url: '/assets/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: { url: '/assets/apple-touch-icon.png', sizes: '180x180' },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // permite conteúdo atrás do notch iOS (safe-area-inset)
  themeColor: '#009900',
};

/**
 * Splash screens iOS — apple-touch-startup-image precisa ser declarada
 * por dispositivo. Tamanhos cobrem iPhone SE até iPad Pro 12.9".
 * Gerados via scripts/generate-splash.mjs a partir do brand mark.
 * Variante `-dark` é selecionada via `prefers-color-scheme: dark` no media.
 */
const APPLE_SPLASH_SIZES: { w: number; h: number; ratio: number }[] = [
  // iPhone SE / 8
  { w: 375,  h: 667,  ratio: 2 },
  // iPhone 11 / XR
  { w: 414,  h: 896,  ratio: 2 },
  // iPhone X / XS / 11 Pro
  { w: 375,  h: 812,  ratio: 3 },
  // iPhone 12 / 12 Pro / 13 / 13 Pro / 14
  { w: 390,  h: 844,  ratio: 3 },
  // iPhone 15 / 15 Pro
  { w: 393,  h: 852,  ratio: 3 },
  // iPhone 12/13/14 Pro Max
  { w: 428,  h: 926,  ratio: 3 },
  // iPhone 15 Plus / 15 Pro Max
  { w: 430,  h: 932,  ratio: 3 },
  // iPad 11"
  { w: 834,  h: 1194, ratio: 2 },
  // iPad Pro 12.9"
  { w: 1024, h: 1366, ratio: 2 },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <head>
        {/* color-scheme reage ao toggle manual (.dark no <html>). Sem
            `only` agora — Auto Dark do Chrome só age quando o usuário
            também muda nosso toggle. */}
        <meta name="color-scheme" content="light dark" />
        {/* Anti-flash: aplica `dark` no <html> antes do primeiro paint
            lendo o localStorage. Sem isso a tela pisca claro → escuro
            depois da hidratação do ThemeProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('kliente360-theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
        {/* iOS splash screens — Next Metadata API ainda não cobre
            apple-touch-startup-image; declarados manualmente. Cada
            device tem 2 variantes (light/dark) selecionadas por
            prefers-color-scheme do SO. */}
        {APPLE_SPLASH_SIZES.flatMap((s) => {
          const px = `${s.w * s.ratio}x${s.h * s.ratio}`;
          const base = `(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio})`;
          return [
            <link
              key={`${px}-light`}
              rel="apple-touch-startup-image"
              href={`/assets/splash/splash-${px}.png`}
              media={`${base} and (prefers-color-scheme: light)`}
            />,
            <link
              key={`${px}-dark`}
              rel="apple-touch-startup-image"
              href={`/assets/splash/splash-${px}-dark.png`}
              media={`${base} and (prefers-color-scheme: dark)`}
            />,
          ];
        })}
      </head>
      <body>{children}</body>
    </html>
  );
}
