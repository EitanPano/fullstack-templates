import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

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

// The data layer is api/ in this SPA (server/ in the Next template): a widget, feature or entity
// reads and writes through its own api/ folder.

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
      'only */api/* and shared/auth import shared/api (a model.ts may import its types and the generated zod schemas): read through the entity query options (entity/<noun>/api) or pass the data in as props',
  },
  {
    from: [{ element: { type: 'shared-auth' } }, { file: { categories: 'api' } }],
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
      'call the API through shared/api (the generated client behind an entity query or a feature mutation), not fetch',
  },
]
// Configuration is read in one place; Vite exposes it as import.meta.env.
const ENV = [
  {
    selector: "MetaProperty[meta.name='import'][property.name='meta']",
    message: 'Read configuration through src/shared/config/env.ts',
  },
]
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

export default defineConfig([
  globalIgnores([
    'dist/**',
    'public/**',
    'src/shared/api/generated/**',
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
      // `role` is RequireRole's prop (an account role), not an ARIA role.
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['src/**'],
    plugins: { boundaries },
    settings: {
      // The TypeScript resolver reads the `@/*` alias from tsconfig.app.json.
      'import/resolver': {
        typescript: { project: `${import.meta.dirname}/tsconfig.app.json` },
      },
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
      'boundaries/files': [{ pattern: 'src/{widget,feature,entity}/*/api/**', category: 'api' }],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'allow', policies }],
      ...restrictSyntax(RAW_CONTROLS, NETWORK, ENV),
    },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/ui/**'],
    rules: restrictSyntax(NETWORK, ENV),
  },
  {
    // The typed client is the one place that names fetch and revalidates.
    files: ['src/shared/api/**'],
    rules: restrictSyntax(RAW_CONTROLS, ENV),
  },
  {
    files: [
      'src/shared/config/env.ts',
      'vite.config.ts',
      'vitest.config.mts',
      'playwright.config.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // A loader redirects by throwing React Router's `redirect()` response, which is its contract.
    files: ['src/shared/auth/session.ts'],
    rules: { '@typescript-eslint/only-throw-error': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
