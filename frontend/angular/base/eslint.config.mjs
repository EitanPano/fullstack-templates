import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import angular from 'angular-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The layer map (AGENTS.md: the opening layer map and "Import rules"). Every import the layers
// forbid is a `boundaries/dependencies` error whose message names the layer to use. tests/unit/eslint-boundaries.spec.ts lints one
// violation and one allowed case per rule through this file, so a rule that stops firing fails the
// suite.
//
// The plugin evaluates policies in order and the last one that matches decides. Each source layer
// therefore gets a disallow policy (the message) followed by an allow policy (the table's row), and
// the cross-cutting policies come after the rows they narrow.
//
// A layer is an element (a folder) or, for the files that sit beside folders, a file category:
// `app` (the files directly in src/app), `page-routes` and `page-form` (beside the page folders in
// src/app/pages/<module>/). `components` is the app-wide folder (the shells and what they compose);
// `page` is a page folder and `page-components` a module's own presentational pieces.
const FILE_LAYERS = ['app', 'page-routes', 'page-form']
const SHARED = ['shared', 'shared-validators']
const CORE_WIRING = ['core-guards', 'core-interceptors', 'core-initializers']
const CORE_LEAVES = ['core-config', 'core-providers', 'core-i18n', 'core-errors']
const CORE = [...CORE_WIRING, ...CORE_LEAVES]
const PAGE = ['page', 'page-components', 'page-routes', 'page-form']
const LAYERS = [
  'app',
  'layout',
  ...PAGE,
  'store',
  'services',
  'services-generated',
  ...CORE,
  ...SHARED,
  'models',
]

// Selectors for layers, split into the element selector and the file selector they need.
// `feature` is a captured-module template; `fileInternalPath` narrows an element selector.
const sel = (layers, { feature, fileInternalPath } = {}) => {
  const list = [layers].flat()
  const types = list.filter((name) => !FILE_LAYERS.includes(name))
  const categories = list.filter((name) => FILE_LAYERS.includes(name))
  const captured = feature ? { captured: { feature } } : {}
  return [
    ...(types.length > 0
      ? [
          {
            element: {
              type: types,
              ...captured,
              ...(fileInternalPath ? { fileInternalPath } : {}),
            },
          },
        ]
      : []),
    ...(categories.length > 0 ? [{ file: { categories, ...captured } }] : []),
  ]
}
// The module of the importing file (pages/<module>/): `from.element` for a folder layer, `from.file` for a file one.
const same = (kind) => `{{ from.${kind}.captured.feature }}`
const other = (kind) => `!{{ from.${kind}.captured.feature }}`

// One row of the import table: where the layer's imports may point, and what to say otherwise.
const row = (from, allowed, message) => [
  { from: sel(from), disallow: { to: sel(LAYERS) }, message },
  { from: sel(from), allow: { to: allowed.flat() } },
]

const policies = [
  ...row(
    'app',
    [sel(['app', 'layout', 'page-routes', ...CORE, 'store', ...SHARED, 'models'])],
    'app/ wires layout/, pages/ (lazy routes only), core/, store/, shared/ and models/: import a page only through its module *.routes.ts, and reach services/ through a store',
  ),
  ...row(
    'layout',
    [sel([...CORE, 'store', ...SHARED, 'models'])],
    'layout/ imports core/, store/, shared/ and models/: read data through store/, not services/ or pages/',
  ),
  ...row(
    'page',
    [
      sel(['store', ...SHARED, 'models', 'core-config', 'core-providers']),
      sel('page-components', { feature: same('element') }),
      sel('page-form', { feature: same('element') }),
    ],
    'a page imports store/, shared/, models/, core/config, core/providers, its own components and its module *.form.ts: call services through a store method, never directly',
  ),
  ...row(
    'page-components',
    [sel([...SHARED, 'models'])],
    'a page component is presentational: it imports shared/ and models/, takes data as inputs and emits outputs; the page reads the store',
  ),
  ...row(
    'page-routes',
    [sel('core-guards'), sel('page', { feature: same('file') })],
    'a module routes file imports core/guards and its own pages only',
  ),
  ...row(
    'page-form',
    [sel(['shared-validators', 'models'])],
    'a *.form.ts imports shared/validators, shared/utils/validation, models/ and the generated zod schemas (services/generated/zod.gen) only',
  ),
  ...row(
    'store',
    [sel(['services', 'models', 'core-providers', 'core-config'])],
    'a store imports services/, models/, core/providers and core/config: put the HTTP call in a service facade and the shared UI in shared/',
  ),
  ...row(
    'services',
    [sel(['models', 'core-config', 'services-generated'])],
    'a service imports models/, core/config and services/generated: it never reaches a store, a page or core/providers',
  ),
  ...row(
    CORE_WIRING,
    [sel(['store', 'services', ...CORE, ...SHARED, 'models'])],
    'core wiring (guards, interceptors, initializers) imports store/, services/, core/, shared/ and models/ only',
  ),
  ...row(
    CORE_LEAVES,
    [sel([...CORE_LEAVES, ...SHARED, 'models'])],
    'core/config, providers, i18n and errors import each other, shared/ and models/ only: the wiring directories, store/ and services/ are above them',
  ),
  ...row(
    SHARED,
    [sel([...SHARED, 'models'])],
    'shared/ is product-agnostic: it imports only shared/ and models/. Move the code to core/, layout/ or a page module, or pass the value in as an input',
  ),
  ...row(
    'models',
    [sel('models')],
    'models/ holds types and constants: it imports models/ and, with import type, the generated types',
  ),
  // Cross-cutting policies come after the rows they narrow.
  ...['element', 'file'].map((kind) => ({
    from: sel(PAGE.filter((name) => FILE_LAYERS.includes(name) === (kind === 'file'))),
    disallow: { to: sel(PAGE, { feature: other(kind) }) },
    message:
      'a page module never imports another page module: lift the shared part to shared/ or compose both in app/ or layout/',
  })),
  {
    from: sel(LAYERS.filter((name) => name !== 'services')),
    disallow: { to: sel('services-generated') },
    message:
      'the generated client is imported only by services/: call it through the facade in services/ (a *.form.ts may import the generated zod schemas, models/ and core/config may import type, core/config/api-client.provider.ts provides it)',
  },
  // models/ re-exports the contract's types; a form builds on the generated zod schemas.
  {
    from: sel('models'),
    dependency: { kind: 'type' },
    allow: { to: sel('services-generated') },
  },
  // core/config describes the generated client types; the one file that provides the client
  // (api-client.provider.ts) imports its runtime. api-client.ts, the generator runtimeConfigPath,
  // imports types only, because the generated client imports it back.
  {
    from: sel('core-config'),
    dependency: { kind: 'type' },
    allow: { to: sel('services-generated') },
  },
  {
    from: sel('core-config', { fileInternalPath: 'api-client.provider.ts' }),
    allow: { to: sel('services-generated') },
  },
  {
    from: sel('page-form'),
    allow: { to: sel('services-generated', { fileInternalPath: 'zod.gen.ts' }) },
  },
  {
    from: sel('page-form'),
    allow: { to: sel('shared', { fileInternalPath: 'utils/validation.ts' }) },
  },
  {
    from: sel('services'),
    allow: { to: sel('services-generated') },
  },
]

const HTTP = [
  {
    name: '@angular/common/http',
    message:
      'HttpClient is imported only in services/, core/interceptors/ and core/config/: call the API through a service facade over the generated client',
  },
]

// An external library is imported only by its facade (AGENTS.md: "External libraries"). The
// framework, rxjs and the libraries ADR 0006 chose as the architecture are exempt.
const VALIDATION_LIBRARY = [
  {
    name: 'zod',
    message:
      'zod is imported only by shared/utils/validation.ts: build and run schemas through its functions',
  },
]

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.angular/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'src/app/services/generated/**',
  ]),
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      // A decorated class with no members (a component whose state is its template) is Angular.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // The TypeScript resolver reads the `@app/*` alias from tsconfig.app.json. Without it an
      // extensionless import does not resolve and the boundary rule stays silent.
      'import/resolver': {
        typescript: { project: `${import.meta.dirname}/tsconfig.app.json` },
      },
      'boundaries/include': ['src/**/*'],
      // main.ts and src/environments/ bootstrap the app outside the layer map.
      'boundaries/ignore': ['**/*.spec.ts', 'src/main.ts', 'src/environments/**'],
      'boundaries/files': [
        { pattern: 'src/app/*.ts', category: 'app' },
        { pattern: 'src/app/pages/*/*.routes.ts', category: 'page-routes', capture: ['feature'] },
        { pattern: 'src/app/pages/*/*.form.ts', category: 'page-form', capture: ['feature'] },
      ],
      'boundaries/elements': [
        { type: 'layout', pattern: 'src/app/layout', partialMatch: false },
        // A component folder inside a page folder, pages/<module>/<page>/<component>: it comes
        // first so it matches before the page element.
        {
          type: 'page-components',
          pattern: 'src/app/pages/*/*/*',
          partialMatch: false,
          capture: ['feature'],
        },
        // A page folder, pages/<module>/<page>: two levels, so the module's own *.routes.ts and
        // *.form.ts (file categories above) are not also read as pages.
        {
          type: 'page',
          pattern: 'src/app/pages/*/*',
          partialMatch: false,
          capture: ['feature', 'page'],
        },
        { type: 'store', pattern: 'src/app/store', partialMatch: false },
        { type: 'services-generated', pattern: 'src/app/services/generated', partialMatch: false },
        { type: 'services', pattern: 'src/app/services', partialMatch: false },
        { type: 'core-guards', pattern: 'src/app/core/guards', partialMatch: false },
        { type: 'core-interceptors', pattern: 'src/app/core/interceptors', partialMatch: false },
        { type: 'core-initializers', pattern: 'src/app/core/initializers', partialMatch: false },
        { type: 'core-config', pattern: 'src/app/core/config', partialMatch: false },
        { type: 'core-providers', pattern: 'src/app/core/providers', partialMatch: false },
        { type: 'core-i18n', pattern: 'src/app/core/i18n', partialMatch: false },
        { type: 'core-errors', pattern: 'src/app/core/errors', partialMatch: false },
        { type: 'shared-validators', pattern: 'src/app/shared/validators', partialMatch: false },
        { type: 'shared', pattern: 'src/app/shared', partialMatch: false },
        { type: 'models', pattern: 'src/app/models', partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies }],
      'boundaries/no-unknown-files': 'error',
      'no-restricted-imports': ['error', { paths: [...HTTP, ...VALIDATION_LIBRARY] }],
    },
  },
  {
    // The only places that name HttpClient: the facades, the interceptors, the client's config and
    // the loader that fetches the copy tables and its spec (ruling R22).
    files: [
      'src/app/services/**/*.ts',
      'src/app/core/interceptors/**/*.ts',
      'src/app/core/config/**/*.ts',
      'src/app/core/i18n/transloco-http.loader*.ts', // @i18n
    ],
    rules: { 'no-restricted-imports': ['error', { paths: VALIDATION_LIBRARY }] },
  },
  {
    // The validation facade is the one file that names the library.
    files: ['src/app/shared/utils/validation.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
