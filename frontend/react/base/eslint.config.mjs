import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// Import direction (AGENTS.md, Layer map): app → feature → shared, lib. Enforced on the
// import path; a cross-feature ui import is caught by its alias or `../../x/ui` shape.
const noImport = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
})

const upward = ['@/feature/*', '@/app/*', '**/feature/**', '**/app/**']
// Another feature's ui/ at any depth: the alias form, and the relative form from 2 to 4 levels
// up (a file in ui/ or api/, or in a subfolder of ui/ up to two deep).
const featureOnly = [
  '@/app/*',
  '**/app/**',
  '@/feature/*/ui/**',
  '../../*/ui/**',
  '../../../*/ui/**',
  '../../../../*/ui/**',
]
const clientPaths = ['@/lib/api/client', '**/lib/api/client', './api/client']

export default defineConfig([
  globalIgnores([
    'dist/**',
    'src/lib/api/schema.d.ts',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
  ]),
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
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
      'no-restricted-syntax': [
        'error',
        {
          selector: "MetaProperty[meta.name='import'][property.name='meta']",
          message: 'Read configuration through src/env.ts',
        },
      ],
    },
  },
  // ESLint does not merge the options of one rule across config blocks: for a file matched by
  // several, the last block's `no-restricted-imports` replaces the earlier ones. So the zones
  // below are disjoint, and each lists every pattern that applies to its files. A new zone
  // must not overlap one of these; `tests/unit/lint-zones.test.ts` seeds one violation per zone.
  {
    files: ['src/lib/api/**'],
    rules: noImport(upward, 'lib/ never imports feature/ or app/'),
  },
  {
    files: ['src/lib/**', 'src/shared/**'],
    ignores: ['src/lib/api/**'],
    rules: noImport(
      [...upward, ...clientPaths],
      'shared/ and lib/ never import feature/ or app/, nor the API client',
    ),
  },
  {
    files: ['src/feature/*/api/**'],
    rules: noImport(
      featureOnly,
      "a feature never imports app/ or another feature's ui/ (inside a feature, import relatively)",
    ),
  },
  {
    files: ['src/feature/**'],
    ignores: ['src/feature/*/api/**'],
    rules: noImport(
      [...featureOnly, ...clientPaths],
      "a feature never imports app/ or another feature's ui/ (inside a feature, import relatively); only feature/*/api/ calls the API client",
    ),
  },
  {
    files: ['src/*.{ts,tsx}', 'src/app/**'],
    rules: noImport(clientPaths, 'only feature/*/api/ calls the API client'),
  },
  {
    files: ['src/env.ts', 'eslint.config.mjs', 'vite.config.ts', 'vitest.config.mts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
