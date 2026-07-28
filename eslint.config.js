// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-server/**',
      '**/build/**',
      '**/coverage/**',
      '**/.react-router/**',
      '**/cdk.out/**',
      '**/.turbo/**',
      '**/node_modules/**',
      // Local, gitignored content-pipeline scratch (never tracked; see .gitignore).
      '**/.local/**',
      '.tooling/**',
      '.pnpm-store/**',
      '.pnpm-cache/**',
      '.tmp/**',
      '**/.xdg-cache/**',
      '.xdg-cache/**',
      'generated/**',
      '**/public/**',
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
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/ui-web/**/*.{ts,tsx}',
      'packages/platform-web/**/*.ts',
      'packages/scene-web/**/*.{ts,tsx}',
    ],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Tests and CLI/dev tooling may use console freely.
    files: ['**/*.test.ts', '**/*.test.tsx', 'tests/**/*.{ts,tsx}', 'tools/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
