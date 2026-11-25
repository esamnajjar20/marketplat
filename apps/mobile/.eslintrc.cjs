module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  env: {
    es2021: true,
    browser: true,
    node: true,
  },
  ignorePatterns: [
    'android/**',
    '.expo/**',
    'assets/**',
    '**/*.d.ts',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/components/MobileUI',
            message: "MobileUI is a deprecated compat shim. Import from '@/components/ui' instead.",
          },
        ],
      },
    ],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    'no-restricted-syntax': [
      'error',
      {
        selector: "Literal[value=/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i]",
        message: 'Use a token from @/theme/tokens instead of a raw hexadecimal color.',
      },
    ],
  },
  overrides: [
    {
      files: ['src/theme/tokens.ts'],
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      files: ['**/__tests__/**/*.{ts,tsx,mts,cts}', '**/*.test.{ts,tsx,mts,cts}'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      files: ['scripts/**/*.{mts,cts}'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-restricted-syntax': 'off',
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',
      },
    },
  ],
};
