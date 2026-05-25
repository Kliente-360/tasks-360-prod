import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          dark:    'var(--brand-dark)',
          light:   'var(--brand-light)',
          soft:    'var(--brand-soft)',
          tint:    'var(--brand-tint)',
        },
        navy: {
          DEFAULT: 'var(--navy)',
          soft:    'var(--navy-soft)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          soft:    'var(--ink-soft)',
        },
        muted:        'var(--muted)',
        line: {
          DEFAULT: 'var(--line)',
          strong:  'var(--line-strong)',
        },
        bg: {
          DEFAULT: 'var(--bg)',
          elev:    'var(--bg-elev)',
        },
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        cyan: {
          DEFAULT: 'var(--cyan)',
          soft:    'var(--cyan-soft)',
        },
        yellow: {
          DEFAULT: 'var(--yellow)',
          soft:    'var(--yellow-soft)',
        },
        triage: {
          DEFAULT: 'var(--triage)',
          soft:    'var(--triage-soft)',
        },
        p0: {
          DEFAULT: 'var(--p0)',
          soft:    'var(--p0-soft)',
        },
        p1: {
          DEFAULT: 'var(--p1)',
          soft:    'var(--p1-soft)',
        },
        p2: {
          DEFAULT: 'var(--p2)',
          soft:    'var(--p2-soft)',
        },
        p3: {
          DEFAULT: 'var(--p3)',
          soft:    'var(--p3-soft)',
        },
        warn:   'var(--warn)',
        danger: 'var(--danger)',
        sig: {
          red:          'var(--sig-red)',
          'red-strong': 'var(--sig-red-strong)',
          'red-bg':     'var(--sig-red-bg)',
          amber:        'var(--sig-amber)',
          'amber-bg':   'var(--sig-amber-bg)',
          'amber-fg':   'var(--sig-amber-fg)',
          green:        'var(--sig-green)',
          'green-strong':'var(--sig-green-strong)',
          'green-bg':   'var(--sig-green-bg)',
          'green-soft': 'var(--sig-green-soft)',
        },
      },
      fontFamily: {
        brand: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        sans:  ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   'var(--fs-xs)',
        sm:   'var(--fs-sm)',
        base: 'var(--fs-base)',
        md:   'var(--fs-md)',
        lg:   'var(--fs-lg)',
        xl:   'var(--fs-xl)',
        '2xl':'var(--fs-2xl)',
        '3xl':'var(--fs-3xl)',
      },
      spacing: {
        'sp-1':  'var(--sp-1)',
        'sp-2':  'var(--sp-2)',
        'sp-3':  'var(--sp-3)',
        'sp-4':  'var(--sp-4)',
        'sp-5':  'var(--sp-5)',
        'sp-6':  'var(--sp-6)',
        'sp-8':  'var(--sp-8)',
        'sp-10': 'var(--sp-10)',
        'sp-12': 'var(--sp-12)',
        'sp-16': 'var(--sp-16)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
      },
      boxShadow: {
        card:  'var(--shadow-card)',
        modal: 'var(--shadow-modal)',
      },
    },
  },
  plugins: [],
};

export default config;
