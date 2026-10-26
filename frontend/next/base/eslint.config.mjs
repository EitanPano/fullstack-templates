import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

import { clientServerImport } from './eslint-rules/client-server-import.mjs'

// The layer map (AGENTS.md › Layers): app → widget → feature → entity → shared. Every import
// the layers forbid is a `boundaries/dependencies` error whose message names the layer to use.
// tests/unit/eslint-boundaries.test.ts lints one violation and one allowed case per rule through
// this file, so a rule that stops firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for that file. `no-restricted-syntax` is therefore built
// from the selector lists below and each block states every selector that applies to it.
const sliceMessage = (layer) =>
  `a ${layer} never imports another ${layer}: lift the shared part to shared/ or compose both in the layer above`

// shared/api and shared/auth are elements of their own so that an import from the rest of
// shared/ counts as a dependency (the plugin skips imports inside one element).
const SHARED = ['shared', 'shared-api', 'shared-auth']

const policies = [
  {
    from: { element: { type: ['widget', 'feature', 'entity', ...SHARED] } },
    disallow: { to: { element: { type: 'app' } } },
    message: 'only app/ is allowed to import app/: routes compose widgets, nothing imports a route',
  },
  {
    from: { element: { type: 'feature' } },
    disallow: { to: { element: { type: 'widget' } } },
    message: 'compose widgets in a widget or in app/: a feature never imports a widget',
  },
  {
    from: { element: { type: 'entity' } },
    disallow: { to: { element: { type: 'widget' } } },
    message: 'compose widgets in a widget or in app/: an entity never imports a widget',
  },
  {
    from: { element: { type: 'entity' } },
    disallow: { to: { element: { type: 'feature' } } },
    message:
      'compose features in a widget: an entity never imports a feature (shared logic goes to shared/)',
  },
  {
    from: { element: { type: SHARED } },
    disallow: { to: { element: { type: ['widget', 'feature', 'entity'] } } },
    message:
      'shared/ is product-agnostic: it never imports widget/, feature/ or entity/. Move the code to entity/ or feature/, or pass it in as props',
  },
  ...['widget', 'feature', 'entity'].map((layer) => ({
    from: { element: { type: layer } },
    disallow: {
      to: {
        element: { type: layer, captured: { slice: '!{{ from.element.captured.slice }}' } },
      },
    },
    message:
      layer === 'entity'
        ? `an entity imports another entity only with import type from its model.ts: ${sliceMessage(layer)}`
        : sliceMessage(layer),
  })),
  {
    from: { element: { type: 'entity' } },
    dependency: { kind: 'type' },
    allow: { to: { element: { type: 'entity', fileInternalPath: 'model.ts' } } },
  },
  {
    disallow: { to: { element: { type: 'shared-api' } } },
    message:
      'only */server/* and shared/auth import shared/api (a model.ts may import its types and the generated zod schemas): read through the entity loader (entity/<noun>/server) or pass the data in as props',
  },
  {
    from: [{ element: { type: 'shared-auth' } }, { file: { categories: 'server' } }],
    allow: { to: { element: { type: 'shared-api' } } },
  },
  // A model.ts is the one non-server file that touches the contract: its types, and the
  // generated zod schemas a form schema extends (so limits are never copied).
  {
    from: { element: { type: ['entity', 'feature'], fileInternalPath: 'model.ts' } },
    dependency: { kind: 'type' },
    allow: { to: { element: { type: 'shared-api' } } },
  },
  {
    from: { element: { type: ['entity', 'feature'], fileInternalPath: 'model.ts' } },
    allow: { to: { element: { type: 'shared-api', fileInternalPath: 'generated/zod.gen.ts' } } },
  },
]

const RAW_CONTROLS = [
  ['button', 'Button from @/shared/ui/button'],
  ['input', 'Input from @/shared/ui/input'],
  ['select', 'Select from @/shared/ui/select'],
  ['textarea', 'Textarea from @/shared/ui/textarea'],
].map(([tag, use]) => ({
  selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name='${tag}']`,
  message: `Use ${use}, not a raw <${tag}>: only shared/ui renders the browser controls`,
}))
const NETWORK = [
  {
    selector:
      "CallExpression[callee.name='fetch'], CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
    message:
      'call the API through shared/api (the typed client behind an entity loader), not fetch',
  },
  {
    selector: "CallExpression[callee.name='revalidatePath']",
    message:
      'revalidatePath is reserved to shared/api: use refresh() from next/cache in an action, or updateTag for a tagged read',
  },
]
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/shared/api/generated/**',
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
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/shared/config/env.ts',
        },
      ],
    },
  },
  {
    files: ['src/**'],
    plugins: { boundaries, local: { rules: { 'client-server-import': clientServerImport } } },
    settings: {
      // eslint-config-next already registers the TypeScript resolver, which reads the `@/*`
      // alias from tsconfig.json.
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'widget', pattern: 'src/widget/*', partialMatch: false, capture: ['slice'] },
        { type: 'feature', pattern: 'src/feature/*', partialMatch: false, capture: ['slice'] },
        { type: 'entity', pattern: 'src/entity/*', partialMatch: false, capture: ['slice'] },
        { type: 'shared-api', pattern: 'src/shared/api', partialMatch: false },
        { type: 'shared-auth', pattern: 'src/shared/auth', partialMatch: false },
        { type: 'shared', pattern: 'src/shared', partialMatch: false },
      ],
      'boundaries/files': [
        { pattern: 'src/{widget,feature,entity}/*/server/**', category: 'server' },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'allow', policies }],
      'local/client-server-import': 'error',
      ...restrictSyntax(RAW_CONTROLS, NETWORK),
    },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/ui/**'],
    rules: restrictSyntax(NETWORK),
  },
  {
    // The typed client is the one place that names fetch and revalidates.
    files: ['src/shared/api/**'],
    rules: restrictSyntax(RAW_CONTROLS),
  },
  {
    files: [
      'src/shared/config/env.ts',
      'playwright.config.ts',
      'vitest.config.mts',
      'scripts/**',
      'tests/**',
    ],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
