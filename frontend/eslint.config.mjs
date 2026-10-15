/**
 * ESLint 9 flat config for Next.js.
 *
 * eslint-config-next@15.x still ships legacy (eslintrc-style) configs,
 * so they must be wrapped with FlatCompat before they can be spread
 * into a flat config array. Without this, `...nextVitals` throws
 * "nextVitals is not iterable" because the export is a plain object.
 */
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import { globalIgnores } from 'eslint/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // CACHE-BUILD-IGNORE: exclude build artifacts and generated files.
  // Without this, ESLint 9 walks .next/** (Next.js build output) and
  // produces hundreds of thousands of false errors on minified JS.
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'public/**/*.min.js',
    'public/tesseract/**',
    'public/sw-diagnostic.js',
    'android/**',
    'ios/**',
    'www/**',
    'lib/vendor/jsQR.js',
    'next-env.d.ts',
    '**/*.min.js',
    '**/*.bundle.js',
    // Backup snapshots — not part of the project
    '.backup_*/**',
    'backup*/**',
    // Receipt page: hand-minified to 3 lines, ESLint can't parse reasonably.
    'app/(protected)/account/sales/**/receipt/page.tsx',
  ]),
  ...compat.extends('next/core-web-vitals', 'next/typescript'),



  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',  // TODO: fix incrementally
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],

      // General
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // React
      // TODO: audit and fix incrementally.
      // These 11 occurrences are intentional patterns (refs, event handlers,
      // single-run effects) where adding the "missing" dependency would
      // cause regressions. Tracked for manual review.
      'react-hooks/exhaustive-deps': 'warn',

      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react/display-name': 'off',

      // Next.js
      '@next/next/no-html-link-for-pages': 'off',
      '@next/next/no-img-element': 'warn',
    },
  },

  {
    files: ['*.config.{js,mjs,ts}', 'postcss.config.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // scripts/ contains audit tools and generators that intentionally:
  //   - use console.* for user-visible output
  //   - use `import()` type syntax for dynamic typing
  //   - use require() in .cjs (CommonJS)
  //   - keep some variables for side effects
  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^(assert|exists|clock|sellersApi|QUEUE_DB)$',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'e2e/**/*.{ts,tsx}', '__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_|^(render|screen|waitFor|userEvent|beforeEach|useHomepage|useProducts|context|QUEUE_DB|assert|exists|clock|sellersApi)$',
          caughtErrors: 'none',
        },
      ],
    },
  },

  {
    files: ['e2e/fixtures/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  // Capacitor's usePreferences has a misleading name — it's not a React Hook.
  // It's an async function that reads from native storage. ESLint flags every
  // call from non-hook functions as "rules-of-hooks" violation.
  {
    files: ['lib/capacitor/nativeSessionStorage.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },

  // app/layout.tsx intentionally inlines a small theme-flash-prevention
  // script synchronously. It must run BEFORE paint to set the theme class,
  // so next/script with strategy="beforeInteractive" is the only correct
  // place. The lint rule is a default Next.js warning that doesn't apply
  // to this specific case.
  {
    files: ['app/layout.tsx'],
    rules: {
      '@next/next/no-sync-scripts': 'off',
    },
  },

  // Test files use raw <img> for assertions/mocks; the Next.js image rule
  // doesn't apply to unit tests (no real rendering/optimization).
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
];

export default eslintConfig;
