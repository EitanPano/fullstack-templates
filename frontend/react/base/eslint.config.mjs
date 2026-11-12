import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The layer map (AGENTS.md › Layers): app → layout, pages → core, store, services → shared,
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
  'page',
  'store',
  'services',
  'services-generated',
  'core',
  'shared',
  'models',
  'testing',
]
const except = (...types) => ALL.filter((type) => !types.includes(type))

const GUARDS_MESSAGE =
  'guards are the wiring above services and the leaves: import them from app/ or a page'

// Later policies override earlier ones, so each forbidden edge comes first and its exceptions after.
const policies = [
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: ['services', 'testing'] } } },
    message:
      'app/ only wires: read data through a hook in a page or a component, and keep test helpers out of the bundle',
  },
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: 'page' } } },
    message:
      'app/ imports a page only through its *.routes.tsx: the page and its components are loaded by the route (lazy), never by app/',
  },
  {
    from: { element: { type: 'app' } },
    allow: { to: { element: { type: 'page', fileInternalPath: '*.routes.tsx' } } },
  },
  {
    from: { element: { type: 'layout' } },
    disallow: { to: { element: { type: ['app', 'page', 'testing'] } } },
    message:
      'layout/ never imports app/, a page or testing/: take the data from a services hook or the store, and compose pages in app/routes.tsx',
  },
  {
    from: { element: { type: 'page' } },
    disallow: { to: { element: { type: ['app', 'layout', 'testing'] } } },
    message:
      'a page never imports app/, layout/ or testing/: routes are composed in app/, and a shared part goes to shared/ or models/',
  },
  {
    from: { element: { type: 'page' } },
    disallow: {
      to: {
        element: { type: 'page', captured: { page: '!{{ from.element.captured.page }}' } },
      },
    },
    message:
      'a page never imports another page: lift the shared part to shared/ (product-agnostic) or models/ (a noun) or compose both in app/',
  },
  // A form schema extends the generated request schema (limits are never copied) and reaches
  // nothing else of the data layer.
  {
    from: { element: { type: 'page', fileInternalPath: '*.form.ts' } },
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
      'store/ imports services/ (reducer, middleware, matchers), core/theme, core/config and models/ only (and the toast facade): it never knows pages, layout or shared/',
  },
  {
    from: { element: { type: 'store' } },
    disallow: { to: { element: { type: 'core', captured: { area: 'auth' } } } },
    message:
      'store/ imports core/theme and core/config only: the auth wiring (core/auth) sits above the store',
  },
  {
    // Sign-out tells the person when the server session may live on: the toast facade is the one
    // part of shared/ the store reaches.
    from: { element: { type: 'store' } },
    allow: {
      to: { element: { type: 'shared', fileInternalPath: 'components/toaster/toaster.tsx' } },
    },
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
    // The guards wire the loaders to the store and the data layer; nothing below them imports them.
    from: { element: { type: ['services', 'core'] } },
    disallow: { to: { file: { categories: 'guards' } } },
    message: 'guards are the wiring above services and the leaves: import them from app/ or a page',
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
      'shared/ is product-agnostic: it imports shared/ and models/ only. Move the code to core/, a page or services/, or pass it in as props',
  },
  {
    from: { element: { type: 'models' } },
    disallow: { to: { element: { type: except('models') } } },
    message:
      'models/ imports models/ and the generated contract types (import type) only: the runtime stays in services/',
  },
  {
    from: { element: { type: ['app', 'layout', 'page', 'shared'] } },
    disallow: { to: { element: { type: 'services-generated' } } },
    message:
      "read the contract's types through models/<entity>/type.ts; only services/, store/, core/ and models/ import the generated files",
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    from: { element: { type: 'page', fileInternalPath: '*.form.ts' } },
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
  ['button', 'Button from @/shared/components/button/button'],
  ['input', 'Input from @/shared/components/form/input'],
  ['select', 'Select from @/shared/components/form/select/select'],
  ['textarea', 'Textarea from @/shared/components/form/textarea'],
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
// CSS lives in a stylesheet beside the component or page (src/styles/ holds the global tree); a
// component renders class names.
const STYLE = [
  {
    selector: "JSXAttribute[name.name='style']",
    message: "add a class to the component's stylesheet, never an inline style",
  },
]
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

// Only services/ calls the generated runtime; a type is welcome anywhere.
const RUNTIME_MESSAGE =
  'only services/ imports the generated runtime: add an endpoint in services/<module>.api.ts and use its hook (a type goes through models/)'
const RUNTIME_GROUP = [
  '@/services/generated',
  '@/services/generated/**',
  '**/services/generated',
  '**/services/generated/**',
  '**/generated',
  '**/generated/*',
]
const RUNTIME = { group: RUNTIME_GROUP, allowTypeImports: true, message: RUNTIME_MESSAGE }

// An external library is imported by its facade only (AGENTS.md › Libraries), so a library switch
// rewrites one file. React, React DOM, React Router, Redux Toolkit and React Redux are the
// architecture (ADR 0007) and need none. Each block below names the facade it exempts.
const LIBRARIES = {
  validation: {
    group: ['zod', 'zod/**', '@hookform/resolvers', '@hookform/resolvers/**'],
    message:
      "build and run a schema through '@/shared/utils/validation', the one file that imports zod",
  },
  icons: {
    group: ['lucide-react', 'lucide-react/**'],
    message: "import an icon from '@/shared/components/icons', the one file that imports lucide",
  },
  toast: {
    group: ['sonner', 'sonner/**'],
    message:
      "show a toast through '@/shared/components/toaster/toaster', the one file that imports sonner",
  },
  form: {
    group: ['react-hook-form', 'react-hook-form/**'],
    message:
      'react-hook-form is imported by shared/components/form/ only: use useSchemaForm and the field components',
  },
  ui: {
    group: ['radix-ui', 'radix-ui/**', '@radix-ui/*'],
    message: 'radix-ui is imported by shared/components/ only: wrap the primitive there',
  },
  classes: {
    group: ['clsx', 'clsx/**'],
    message: "build class names with 'cn' from '@/shared/utils/cn', the one file that imports clsx",
  },
  dates: {
    group: ['date-fns', 'date-fns/**', '@date-fns/tz', '@date-fns/tz/**'],
    message: "format and zone dates through '@/shared/utils/date', the one file that imports date-fns",
  },
}
// The library patterns that apply to a file, less the facade it is.
const libraries = (...facades) =>
  Object.entries(LIBRARIES)
    .filter(([name]) => !facades.includes(name))
    .map(([, pattern]) => pattern)
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
})
// The data-layer rule plus the library rules, for a file that is the facade of `facades`.
const onlyServices = (...facades) => restrictImports(RUNTIME, ...libraries(...facades))

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
      // Tests, the styles tree (not code) and the Vite type shim sit outside the layers.
      'boundaries/ignore': ['src/**/*.test.{ts,tsx}', 'src/styles/**', 'src/vite-env.d.ts'],
      // A file matches every element that fits, so the nested generated folder stops the search.
      // The guards file is a category, not an element: elements are folders.
      'boundaries/files': [
        { pattern: 'src/core/auth/guards.ts', category: 'guards' },
        { pattern: 'src/main.tsx', category: 'entry' },
      ],
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'layout', pattern: 'src/layout', partialMatch: false },
        { type: 'page', pattern: 'src/pages/*', partialMatch: false, capture: ['page'] },
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
      // A file in a directory no layer claims (src/hooks, src/lib, src/utils, a stray file under
      // src/) is an error, and so is importing one: put it in a layer from AGENTS.md › Layers.
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
      ...onlyServices(),
      ...restrictSyntax(RAW_CONTROLS, NETWORK, ENV, STYLE),
    },
  },
  {
    // An entity's interface.ts holds interfaces; every other file declares types.
    files: ['src/models/*/interface.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'interface'] },
  },
  {
    // The data layer: the one place the generated runtime is imported. RTK Query's `void` argument
    // type (`build.query<Data, void>`) is a call type argument, which this rule refuses by default.
    files: ['src/services/**'],
    rules: {
      ...restrictImports(...libraries()),
      '@typescript-eslint/no-invalid-void-type': 'off',
    },
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    files: ['src/pages/*/*.form.ts'],
    rules: {
      // A regex, because a negated glob cannot re-include a file under an excluded directory:
      // the barrel, any relative spelling and every generated file except zod.gen.
      ...restrictImports(
        {
          regex: '(^|/)generated(/(?!zod[.]gen$).*)?$',
          allowTypeImports: true,
          message: RUNTIME_MESSAGE,
        },
        ...libraries(),
      ),
    },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/components/**'],
    rules: { ...restrictSyntax(NETWORK, ENV, STYLE), ...onlyServices('ui') },
  },
  {
    // Each library's facade is the one file that imports it; the form folder is react-hook-form's.
    files: ['src/shared/components/form/**'],
    rules: onlyServices('ui', 'form'),
  },
  {
    files: ['src/shared/components/icons.ts'],
    rules: onlyServices('ui', 'icons'),
  },
  {
    files: ['src/shared/components/toaster/toaster.tsx'],
    rules: onlyServices('ui', 'toast'),
  },
  {
    files: ['src/shared/utils/validation.ts'],
    rules: onlyServices('validation'),
  },
  {
    files: ['src/shared/utils/cn.ts'],
    rules: onlyServices('classes'),
  },
  {
    files: ['src/shared/utils/date.ts'],
    rules: onlyServices('dates'),
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
    // The generator keeps one of the two returns (the account menu or the theme menu alone), so in
    // place the second is unreachable on purpose.
    files: ['src/layout/app-account-slot.tsx'],
    rules: { 'no-unreachable': 'off' },
  },
  {
    // This test drives the generated SDK itself: it asserts what the client's fetch wrapper does
    // to a raw request, below the data layer's endpoints.
    files: ['src/core/config/api-client.test.ts', 'src/core/config/api-client-refresh.test.ts'],
    rules: restrictImports(...libraries()),
  },
  {
    // The hint shares the guards' folder, so the boundary rule sees one element and cannot tell
    // them apart; this file is a leaf and must not import the wiring beside it.
    files: ['src/core/auth/session-hint.ts'],
    rules: {
      ...restrictImports(
        { group: ['@/core/auth/guards', './guards'], message: GUARDS_MESSAGE },
        {
          group: ['**/services/generated', '**/services/generated/**'],
          message: RUNTIME_MESSAGE,
          allowTypeImports: true,
        },
        ...libraries(),
      ),
    },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
