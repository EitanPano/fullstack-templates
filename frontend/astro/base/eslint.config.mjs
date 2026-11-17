// Layering is enforced here, not only described in AGENTS.md: the import rules are deny zones, so a
// new file is constrained by default, and tests/unit/eslint-boundaries.test.ts lints one violation
// and one allowed case per rule through this very config. Each message names the layer to use
// instead. The layer map is AGENTS.md › Layer map:
//
//   pages/       compose layouts, components, services and models; nothing imports a page
//   layouts/     components, services and models
//   components/  services and models (an island under components/islands/ is a component)
//   services/    models, and the generated client behind it: never a component, layout or page
//   models/      models, and the generated contract types (import type): never a runtime layer
//
// ESLint flat config does not merge one rule's options across blocks: the last block that matches a
// file replaces the rule for that file, so each block below states every entry that applies to it.
import eslint from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import astro from 'eslint-plugin-astro'
import { importX } from 'eslint-plugin-import-x'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

const src = (...parts) => `./src/${parts.join('/')}`

export const zones = [
  {
    target: src('models', '**'),
    from: [
      src('components', '**'),
      src('layouts', '**'),
      src('pages', '**'),
      src('services', '*.ts'),
      src('nav.{ts,mts}'),
    ],
    message:
      'models/ is a leaf: it imports models/ and the generated contract types (import type) only; the runtime stays in services/.',
  },
  {
    target: src('services', '**'),
    from: [src('components', '**'), src('layouts', '**'), src('pages', '**'), src('nav.{ts,mts}')],
    message:
      'services/ is the data and library layer: it imports models/ only, never a component, a layout or a page.',
  },
  {
    target: src('nav.{ts,mts}'),
    from: [src('components', '**'), src('layouts', '**'), src('pages', '**'), src('services', '*.ts')],
    message: 'nav.ts is a table: it imports models/ only.',
  },
  {
    target: src('components', '**'),
    from: [src('layouts', '**'), src('pages', '**')],
    message:
      'a component is placed by a layout or a page: it imports components/, services/ and models/ only.',
  },
  {
    target: src('layouts', '**'),
    from: [src('pages', '**')],
    message: 'a layout wraps a page and never imports one: pages import layouts.',
  },
]

const GENERATED = {
  group: ['**/generated', '**/generated/**'],
  allowTypeImports: true,
  message:
    "only src/services/ imports the generated client at run time: add a call in services/<entity>.ts built on services/api.ts and import that (a type may be imported with 'import type').",
}
const ZOD = {
  group: ['zod', 'zod/*'],
  message:
    'zod is imported only by src/services/validation.ts: use its functions (parse, stringLimits).',
}
// A control is a kit component: a raw element outside src/components/ui fails lint, in markup and
// in a script (createElement).
const CONTROLS = 'button|input|select|textarea'
const RAW_CONTROLS = [
  {
    selector: `JSXOpeningElement[name.name=/^(${CONTROLS})$/]`,
    message:
      'A control belongs to the kit: use src/components/ui (button, input, ...), not a raw element.',
  },
  {
    selector: `CallExpression[callee.property.name='createElement'][arguments.0.value=/^(${CONTROLS})$/]`,
    message: 'A control belongs to the kit: build it in src/components/ui, not with createElement.',
  },
]
const FETCH = {
  selector:
    "CallExpression[callee.name='fetch'], CallExpression[callee.object.name=/^(globalThis|window)$/][callee.property.name='fetch']",
  message:
    'Call the API through a service in src/services (the generated SDK behind services/api.ts), not fetch.',
}
// Build-time configuration is read in one place: src/env.ts (browser-visible PUBLIC_ values only).
const ENV = {
  selector:
    "MemberExpression[object.type='MetaProperty'][property.name='env'], MemberExpression[object.name='process'][property.name='env']",
  message:
    'Read configuration through src/env.ts (the one reader of import.meta.env, PUBLIC_ values only).',
}
// The policy has no 'unsafe-inline': an inline event handler or a style attribute is refused.
const INLINE = [
  {
    selector: "JSXAttribute[name.name=/^on[a-z]+$/][value.type='Literal']",
    message:
      'No inline event-handler attribute: the policy has no unsafe-inline. Attach the handler in a <script>.',
  },
  {
    selector: "JSXAttribute[name.name='style']",
    message:
      'No style attribute or prop: the policy has no unsafe-inline. Write a class in the sibling .scss.',
  },
]

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.astro/**',
    'src/services/generated/**',
    'playwright-report/**',
    'test-results/**',
    'coverage/**',
    'node_modules/**',
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,astro}'],
    plugins: { 'import-x': importX },
    settings: {
      // The TypeScript resolver reads tsconfig.json; without it a violation is silently missed.
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: './tsconfig.json' }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/**'],
    rules: {
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones }],
      'no-restricted-imports': ['error', { patterns: [GENERATED, ZOD] }],
      'no-restricted-syntax': ['error', ...RAW_CONTROLS, FETCH, ENV, ...INLINE],
    },
  },
  {
    // The kit is the one place for a control.
    files: ['src/components/ui/**'],
    rules: { 'no-restricted-syntax': ['error', FETCH, ENV, ...INLINE] },
  },
  {
    // The data layer: the generated client's one importer. services/validation.ts names zod.
    files: ['src/services/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [ZOD] }],
      'no-restricted-syntax': ['error', ...RAW_CONTROLS, FETCH, ENV, ...INLINE],
    },
  },
  {
    files: ['src/services/validation.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Islands are React: a plain element is a React element there, and the kit's Astro components
    // cannot render inside one. A style prop is still refused (the server-rendered HTML would carry
    // a style attribute the policy blocks).
    files: ['src/components/islands/**/*.tsx'],
    rules: { 'no-restricted-syntax': ['error', FETCH, ENV, ...INLINE] },
  },
  {
    files: ['src/env.ts'],
    rules: { 'no-restricted-syntax': ['error', ...RAW_CONTROLS, FETCH, ...INLINE] },
  },
  { files: ['src/env.d.ts'], rules: { '@typescript-eslint/triple-slash-reference': 'off' } },
  {
    // Declaration merging needs an interface.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },
  {
    // Models split interfaces from type aliases by file name.
    files: ['src/models/*/interface.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'interface'] },
  },
  {
    // The no-flash theme script runs in the browser, as a plain script.
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { document: 'readonly', localStorage: 'readonly', matchMedia: 'readonly' },
    },
  },
  {
    // Node scripts and config: the runtime globals the base config does not know.
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
])
