import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

// Import direction (AGENTS.md, Architecture): app → feature → shared, lib. Enforced here
// on the import path; a cross-feature ui import is caught by its alias or `../../x/ui` shape.
const noImport = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
})

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/lib/api/schema.d.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'process', property: 'env', message: 'Read configuration through src/env.ts' },
      ],
    },
  },
  {
    files: ['src/shared/**', 'src/lib/**'],
    rules: noImport(
      ['@/feature/*', '@/app/*', '**/feature/**', '**/app/**'],
      'shared/ and lib/ never import feature/ or app/',
    ),
  },
  {
    files: ['src/feature/**'],
    rules: noImport(
      ['@/app/*', '**/app/**', '@/feature/*/ui/*', '../../*/ui/*'],
      "a feature never imports app/ or another feature's ui/",
    ),
  },
  {
    // The API client is called from feature loaders and actions only; pages and components
    // receive data through props.
    files: ['src/**'],
    ignores: ['src/feature/*/server/**', 'src/lib/api/**'],
    rules: noImport(
      ['@/lib/api/client', '**/lib/api/client'],
      'only feature/*/server/ calls the API client',
    ),
  },
  {
    files: ['src/env.ts', 'playwright.config.ts', 'vitest.config.mts', 'tests/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
