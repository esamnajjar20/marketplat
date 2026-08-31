/**
 * Tailwind CSS configuration.
 *
 * Sprint 1: surface hierarchy, soft/muted brand tints, elevation shadows.
 */
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],

  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './providers/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],

  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        surface: {
          1: 'hsl(var(--surface-1))',
          2: 'hsl(var(--surface-2))',
          3: 'hsl(var(--surface-3))',
        },

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          soft: 'hsl(var(--primary-soft))',
          muted: 'hsl(var(--primary-muted))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          soft: 'hsl(var(--accent-soft))',
          muted: 'hsl(var(--accent-muted))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
        },
        rating: {
          DEFAULT: 'hsl(var(--rating))',
          foreground: 'hsl(var(--rating-foreground))',
        },
        online: {
          DEFAULT: 'hsl(var(--online))',
          foreground: 'hsl(var(--online-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
      },

      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        'glow-primary': 'var(--shadow-glow-primary)',
        'glow-accent': 'var(--shadow-glow-accent)',
      },

      fontFamily: {
        sans: ['var(--font-cairo)', 'sans-serif'],
        cairo: ['var(--font-cairo)', 'sans-serif'],
        'sans-arabic': ['var(--font-ibm-plex-sans-arabic)', 'var(--font-cairo)', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'monospace'],
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'page-fade': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'heart-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '70%': { transform: 'scale(0.92)' },
          '100%': { transform: 'scale(1)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'soft-bounce': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-3px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'page-fade': 'page-fade 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        'heart-pop': 'heart-pop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'soft-bounce': 'soft-bounce 1.6s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        'fade-in-up': 'fade-in-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },

  plugins: [require('tailwindcss-animate')],
};

export default config;
