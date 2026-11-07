import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The layer map (AGENTS.md › Layers): app → layout → features → core, store, services → shared,
// models. Every import the layers forbid is a `boundaries/dependencies` error whose message names
// the layer to use. tests/unit/eslint-boundaries.test.ts lints one violation and one allowed case
// per rule through this file, so a rule that stops firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for that file. `no-restricted-syntax` is therefore built
// from the selector lists below and each block states every selector that applies to it.
const ALL = [
  'app',
  'layout',
  'feature',
  'store',
  'services',
  'services-generated',
  'core',
  'shared',
  'models',
  'testing',
]
const except = (...types) => ALL.filter((type) => !types.includes(type))

// Later policies override earlier ones, so each forbidden edge comes first and its exceptions after.
const policies = [
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: ['services', 'testing'] } } },
    message:
      'app/ only wires: read data through a hook in a feature or the layout, and keep test helpers out of the bundle',
  },
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: 'feature' } } },
    message:
      'app/ imports a feature only through its *.routes.tsx: pages and components are loaded by the route (lazy), never by app/',
  },
  {
    from: { element: { type: 'app' } },
    allow: { to: { element: { type: 'feature', fileInternalPath: '*.routes.tsx' } } },
  },
  {
    from: { element: { type: 'layout' } },
    disallow: { to: { element: { type: ['app', 'feature', 'testing'] } } },
    message:
      'layout/ never imports app/, a feature or testing/: take the data from a services hook or the store, and compose features in app/routes.tsx',
  },
  {
    from: { element: { type: 'feature' } },
    disallow: { to: { element: { type: ['app', 'layout', 'testing'] } } },
    message:
      'a feature never imports app/, layout/ or testing/: routes are composed in app/, and a shared part goes to shared/ or models/',
  },
  {
    from: { element: { type: 'feature' } },
    disallow: {
      to: {
        element: { type: 'feature', captured: { feature: '!{{ from.element.captured.feature }}' } },
      },
    },
    message:
      'a feature never imports another feature: lift the shared part to shared/ (product-agnostic) or models/ (a noun) or compose both in app/',
  },
  // A form schema extends the generated request schema (limits are never copied) and reaches
  // nothing else of the data layer.
  {
    from: { element: { type: 'feature', fileInternalPath: '*.form.ts' } },
    disallow: {
      to: { element: { type: ['layout', 'store', 'services', 'core'] } },
    },
    message:
      'a *.form.ts imports shared/, models/ and the generated zod schemas only: keep the form schema pure',
  },
  {
    from: { element: { type: 'store' } },
    disallow: { to: { element: { type: except('store', 'services', 'core', 'models') } } },
    message:
      'store/ imports services/ (reducer, middleware, matchers), core/theme, core/config and models/ only: it never knows features, layout or shared/',
  },
  {
    from: { element: { type: 'store' } },
    disallow: { to: { element: { type: 'core', captured: { area: 'auth' } } } },
    message:
      'store/ imports core/theme and core/config only: the auth wiring (core/auth) sits above the store',
  },
  {
    from: { element: { type: 'services' } },
    disallow: {
      to: { element: { type: except('services', 'services-generated', 'core', 'models') } },
    },
    message:
      'services/ imports services/generated, core/config, core/auth and models/ only: it never knows the store, shared/ or any screen',
  },
  {
    from: { element: { type: 'services' } },
    disallow: { to: { element: { type: 'core', captured: { area: 'theme' } } } },
    message: 'services/ imports core/config and core/auth only: the theme is the UI concern',
  },
  {
    from: { element: { type: 'core' } },
    disallow: { to: { element: { type: except('core', 'shared', 'models') } } },
    message:
      'core/config, core/auth/session-hint.ts and core/theme import shared/, models/ and each other only; core/auth/guards.ts is the one file that reaches store/ and services/',
  },
  {
    // The guards are the one core file that wires the loaders to the store and the data layer.
    from: { file: { categories: 'guards' } },
    allow: { to: { element: { type: ['store', 'services'] } } },
  },
  {
    from: { element: { type: 'shared' } },
    disallow: { to: { element: { type: except('shared', 'models') } } },
    message:
      'shared/ is product-agnostic: it imports shared/ and models/ only. Move the code to core/, a feature or services/, or pass it in as props',
  },
  {
    from: { element: { type: 'models' } },
    disallow: { to: { element: { type: except('models') } } },
    message:
      'models/ imports models/ and the generated contract types (import type) only: the runtime stays in services/',
  },
  {
    from: { element: { type: ['app', 'layout', 'feature', 'shared'] } },
    disallow: { to: { element: { type: 'services-generated' } } },
    message:
      "read the contract's types through models/<noun>.ts; only services/, store/, core/ and models/ import the generated files",
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    from: { element: { type: 'feature', fileInternalPath: '*.form.ts' } },
    allow: { to: { element: { type: 'services-generated', fileInternalPath: 'zod.gen.ts' } } },
  },
  {
    // main.tsx is the entry: it wires the app, the store, the theme and the styles, nothing else.
    from: { file: { categories: 'entry' } },
    disallow: { to: { element: { type: except('app', 'store', 'core', 'shared', 'models') } } },
    message:
      'main.tsx imports app/, store/, core/ and shared/ only: routes and screens are composed in app/, test helpers never ship',
  },
  {
    // The contract's types reach a layer that is not UI through import type; the runtime stays in services/.
    from: { element: { type: ['store', 'core', 'models'] } },
    dependency: { kind: 'type' },
    allow: { to: { element: { type: 'services-generated' } } },
  },
  {
    from: { element: { type: except('testing') } },
    disallow: { to: { element: { type: 'testing' } } },
    message: 'only a *.test.ts(x) imports testing/: it holds test helpers and is never bundled',
  },
]

const RAW_CONTROLS = [
  ['button', 'Button from @/shared/components/button'],
  ['input', 'Input from @/shared/components/input'],
  ['select', 'Select from @/shared/components/select'],
  ['textarea', 'Textarea from @/shared/components/textarea'],
].map(([tag, use]) => ({
  selector: `JSXOpeningElement[name.type='JSXIdentifier'][name.name='${tag}']`,
  message: `Use ${use}, not a raw <${tag}>: only shared/components renders the browser controls`,
}))
const NETWORK = [
  {
    selector:
      "CallExpression[callee.name='fetch'], CallExpression[callee.object.name='globalThis'][callee.property.name='fetch'], CallExpression[callee.object.name='window'][callee.property.name='fetch']",
    message:
      'call the API through a services/<module>.api.ts endpoint (the generated SDK behind call), not fetch',
  },
]
// Configuration is read in one place; Vite exposes it as import.meta.env.
const ENV = [
  {
    selector: "MetaProperty[meta.name='import'][property.name='meta']",
    message: 'Read configuration through src/core/config/env.ts',
  },
]
// CSS lives in src/styles/ only; a component renders class names.
const STYLE = [
  {
    selector: "JSXAttribute[name.name='style']",
    message: 'styles live in src/styles/: add a class and a partial, never an inline style',
  },
]
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

// Only services/ calls the generated runtime; a type is welcome anywhere.
const RUNTIME_MESSAGE =
  'only services/ imports the generated runtime: add an endpoint in services/<module>.api.ts and use its hook (a type goes through models/)'
const onlyServices = (...group) => ({
  'no-restricted-imports': [
    'error',
    { patterns: [{ group, allowTypeImports: true, message: RUNTIME_MESSAGE }] },
  ],
})

export default defineConfig([
  globalIgnores([
    'dist/**',
    'public/**',
    'src/services/generated/**',
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
      // A component may take a `role` prop that is an account role, not an ARIA role.
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
      // A test file is the consumer the layers exist for: it may import any of them.
      'boundaries/ignore': ['src/**/*.test.{ts,tsx}'],
      // A file matches every element that fits, so the nested generated folder stops the search.
      // The guards file is a category, not an element: elements are folders.
      'boundaries/files': [
        { pattern: 'src/core/auth/guards.ts', category: 'guards' },
        { pattern: 'src/main.tsx', category: 'entry' },
      ],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'layout', pattern: 'src/layout', partialMatch: false },
        { type: 'feature', pattern: 'src/features/*', partialMatch: false, capture: ['feature'] },
        { type: 'store', pattern: 'src/store', partialMatch: false },
        {
          type: 'services-generated',
          pattern: 'src/services/generated',
          partialMatch: false,
          stopMatching: true,
        },
        { type: 'services', pattern: 'src/services', partialMatch: false },
        { type: 'core', pattern: 'src/core/*', partialMatch: false, capture: ['area'] },
        { type: 'shared', pattern: 'src/shared', partialMatch: false },
        { type: 'models', pattern: 'src/models', partialMatch: false },
        { type: 'testing', pattern: 'src/testing', partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'allow', policies }],
      ...onlyServices(
        '@/services/generated',
        '@/services/generated/**',
        '**/services/generated',
        '**/services/generated/**',
        '**/generated',
        '**/generated/*',
      ),
      ...restrictSyntax(RAW_CONTROLS, NETWORK, ENV, STYLE),
    },
  },
  {
    // The data layer: the one place the generated runtime is imported. RTK Query's `void` argument
    // type (`build.query<Data, void>`) is a call type argument, which this rule refuses by default.
    files: ['src/services/**'],
    rules: { 'no-restricted-imports': 'off', '@typescript-eslint/no-invalid-void-type': 'off' },
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    files: ['src/features/*/*.form.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // A regex, because a negated glob cannot re-include a file under an excluded directory:
          // the barrel, any relative spelling and every generated file except zod.gen.
          patterns: [
            {
              regex: '(^|/)generated(/(?!zod[.]gen$).*)?$',
              allowTypeImports: true,
              message: RUNTIME_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/components/**'],
    rules: restrictSyntax(NETWORK, ENV, STYLE),
  },
  {
    // The one file allowed to call fetch: the generated client's fetch wrapper lives here, because
    // the client's runtime config is where its fetch is replaced.
    files: ['src/core/config/api-client.ts'],
    rules: restrictSyntax(RAW_CONTROLS, ENV, STYLE),
  },
  {
    files: ['src/core/config/env.ts'],
    rules: restrictSyntax(RAW_CONTROLS, NETWORK, STYLE),
  },
  {
    files: ['vite.config.ts', 'vitest.config.mts', 'playwright.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // A loader redirects by throwing React Router's `redirect()` response, which is its contract.
    files: ['src/core/auth/guards.ts'],
    rules: { '@typescript-eslint/only-throw-error': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
