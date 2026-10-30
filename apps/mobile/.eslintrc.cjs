module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  env: { es2021: true, browser: true, node: true },
  ignorePatterns: ['android/**', '.expo/**', 'assets/**', 'scripts/**', '**/*.d.ts'],
  rules: {
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
      files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
