/**
 * Tailwind CSS configuration.
 *
 * FIX TAILWIND-01: Removed './pages/**' and './src/**' content paths.
 *   These directories do not exist in this project (App Router at root).
 *   Scanning non-existent paths wastes build time and causes confusing
 *   "no utility classes found" warnings in some Tailwind versions.
 *
 * FIX TAILWIND-02: Added './providers/**' and './config/**' to content
 *   scanning so classes used in those files are included in the build.
 *
 * FIX TAILWIND-03: Removed dead 'var(--font-inter)' from fontFamily.sans.
 *   IBM Plex Mono variable added to match layout.tsx font loading.
 */
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],

  // FIX TAILWIND-01: Only scan directories that actually exist.
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './providers/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  theme: {
    container: {
      center:  true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // FIX UX-01: dedicated semantic tokens for ad status (active/
        // sold/featured) — replaces scattered raw Tailwind stock colors
        // (bg-amber-400, bg-green-500, ...) hand-picked per component.
        success: {
          DEFAULT:    'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      fontFamily: {
        // FIX TAILWIND-03: removed dead var(--font-inter) — not loaded in layout.tsx.
        sans:         ['var(--font-cairo)', 'sans-serif'],
        cairo:        ['var(--font-cairo)', 'sans-serif'],
        // PERF-04: Added now that IBM_Plex_Sans_Arabic is actually loaded in layout.tsx.
        'sans-arabic': ['var(--font-ibm-plex-sans-arabic)', 'var(--font-cairo)', 'sans-serif'],
        mono:         ['var(--font-ibm-plex-mono)', 'monospace'],
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
      },
    },
  },

  plugins: [require('tailwindcss-animate')],
};

export default config;
