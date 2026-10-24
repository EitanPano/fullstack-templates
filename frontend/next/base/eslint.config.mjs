import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

// Import direction (AGENTS.md, Architecture): app → feature → shared, lib. Enforced here on
// the import path; a cross-feature ui import is caught by its alias or `../../x/ui` shape.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for that file. So the zones below are disjoint, and each
// states every restriction that applies to its files. A new block that overlaps a zone would
// silently switch that zone's rules off; tests/unit/eslint-zones.test.ts fails if it does.
// Relative patterns are depth-bound: a feature file at most three levels below
// src/feature/<name>/ is covered; deeper nesting must use the `@/` alias.
const restrict = (...rules) => ({
  'no-restricted-imports': [
    'error',
    { patterns: rules.map(({ group, message }) => ({ group, message })) },
  ],
})
const toFeatureOrApp = {
  group: ['@/feature/*', '@/app/*', '**/feature/**', '**/app/**'],
  message: 'shared/ and lib/ never import feature/ or app/',
}
const toApp = {
  group: ['@/app/*', '**/app/**'],
  message: 'a feature never imports app/',
}
const toOtherFeatureUi = {
  group: ['@/feature/*/ui/*', '../../*/ui/*', '../../../*/ui/*', '../../../../*/ui/*'],
  message: "a feature never imports another feature's ui/: lift it to shared/ or pass props",
}
// The API client is called from feature loaders and actions only; pages and components
// receive data through props.
const toClient = {
  group: ['@/lib/api/client', '**/lib/api/client'],
  message: 'only feature/*/server/ calls the API client',
}

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
    ignores: ['src/lib/api/**'],
    rules: restrict(toFeatureOrApp, toClient),
  },
  {
    // lib/api defines the client, so it is the one place that may name it.
    files: ['src/lib/api/**'],
    rules: restrict(toFeatureOrApp),
  },
  {
    files: ['src/feature/**'],
    ignores: ['src/feature/*/server/**'],
    rules: restrict(toApp, toOtherFeatureUi, toClient),
  },
  {
    files: ['src/feature/*/server/**'],
    rules: restrict(toApp, toOtherFeatureUi),
  },
  {
    // app/ and src/ root files (env.ts): they may import features, never the client.
    files: ['src/**'],
    ignores: ['src/shared/**', 'src/lib/**', 'src/feature/**'],
    rules: restrict(toClient),
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
