// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.react-router/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '.tooling/**',
      '.pnpm-store/**',
      'generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Browser code
    files: ['apps/**/*.{ts,tsx}', 'packages/ui-web/**/*.{ts,tsx}', 'packages/platform-web/**/*.ts', 'packages/scene-web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Tests may use console freely and relax a few rules.
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
);
