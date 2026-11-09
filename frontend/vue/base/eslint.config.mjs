import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'
import vue from 'eslint-plugin-vue'
import vuejsAccessibility from 'eslint-plugin-vuejs-accessibility'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

// The layer map (AGENTS.md › Layers): app → components, pages → core, store, services → shared,
// models; components/ and pages/<module>/ never import each other. Every import the layers forbid is a `boundaries/dependencies` error whose message names
// the layer to use. tests/unit/eslint-boundaries.spec.ts lints one violation and one allowed case
// per rule through this file, so a rule that stops firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for that file. `no-restricted-syntax` and
// `no-restricted-imports` are therefore built from the lists below and each block states every
// entry that applies to it.
const CORE_LEAVES = ['core-config', 'core-providers', 'core-i18n', 'core-errors']
const CORE_WIRING = ['core-guards', 'core-initializers', 'core-interceptors']
// The generated folder is governed by its own policies (the contract's runtime stays in the data
// layer), so the layer lists below leave it out.
const ALL = [
  'app',
  'components',
  'page',
  'store',
  'services',
  ...CORE_LEAVES,
  ...CORE_WIRING,
  'shared',
  'models',
  'testing',
]
const except = (...types) => ALL.filter((type) => !types.includes(type))
const SHARED_BEYOND_VALIDATORS = ['components/**', 'composables/**', 'directives/**', 'utils/**']

const GENERATED_MESSAGE =
  "read the contract's types through models/<noun>/; only services/ and core/interceptors/http.provider.ts import the generated runtime, and store/, core/ and models/ may import its types"

// Later policies override earlier ones, so each forbidden edge comes first and its exceptions after.
const policies = [
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: ['services'] } } },
    message:
      'app/ only wires: read data through a store in a page or in components/, never services/',
  },
  {
    from: { element: { type: 'app' } },
    disallow: { to: { element: { type: 'page' } } },
    message:
      'app/ imports a page module only through its *.routes.ts: the pages are loaded by the route (lazy), never by app/',
  },
  {
    from: { element: { type: 'app' } },
    allow: { to: { element: { type: 'page', fileInternalPath: '*.routes.ts' } } },
  },
  {
    // main.ts is the entry: it wires the app and the styles, nothing else.
    from: { file: { categories: 'entry' } },
    disallow: {
      to: {
        element: {
          type: except('app', ...CORE_LEAVES, ...CORE_WIRING, 'shared', 'models'),
        },
      },
    },
    message:
      'main.ts imports app/, core/, shared/ and models/ only: plugins and routes are wired in app/',
  },
  {
    from: { element: { type: 'components' } },
    disallow: {
      to: {
        element: {
          type: except(
            'components',
            'store',
            'core-config',
            'core-providers',
            'shared',
            'models',
            'testing',
          ),
        },
      },
    },
    message:
      'components/ imports core/config, core/providers, store/, shared/ and models/ only: compose pages in app/routes.ts and read data through a store',
  },
  {
    from: { element: { type: 'page', fileInternalPath: ['*.vue', '!(*.routes|*.form).ts'] } },
    disallow: {
      to: {
        element: {
          type: [
            'app',
            'components',
            'services',
            'core-i18n',
            'core-errors',
            'core-initializers',
            'core-interceptors',
          ],
        },
      },
    },
    message:
      'a page reads a store, never services/: add a facade method and a store method first (a page imports store/, shared/, models/, core/config, core/providers, core/guards and its own page module only)',
  },
  {
    from: { element: { type: 'page', fileInternalPath: 'components/**' } },
    disallow: { to: { element: { type: except('page', 'shared', 'models', 'testing') } } },
    message:
      'a page component imports shared/ and models/ only: take data as props and read stores in the page',
  },
  {
    from: { element: { type: 'page', fileInternalPath: '*.routes.ts' } },
    disallow: { to: { element: { type: except('page', 'core-guards', 'testing') } } },
    message:
      'a *.routes.ts imports core/guards and its own page module only: the route table is composed in app/routes.ts',
  },
  {
    // A form schema extends the generated request schema (limits are never copied) and reaches
    // nothing else of the data layer.
    from: { element: { type: 'page', fileInternalPath: '*.form.ts' } },
    disallow: { to: { element: { type: except('page', 'shared', 'models', 'testing') } } },
    message:
      'a *.form.ts imports shared/validators, models/ and the generated zod schemas only: keep the form schema pure',
  },
  {
    from: { element: { type: 'page', fileInternalPath: '*.form.ts' } },
    disallow: { to: { element: { type: 'shared', fileInternalPath: SHARED_BEYOND_VALIDATORS } } },
    message:
      'a *.form.ts imports shared/validators, models/ and the generated zod schemas only: keep the form schema pure',
  },
  {
    from: { element: { type: 'page' } },
    disallow: {
      to: {
        element: {
          type: 'page',
          captured: { page: '!{{ from.element.captured.page }}' },
        },
      },
    },
    message:
      'a page module never imports another page module: lift the shared part to shared/ (product-agnostic) or models/ (a noun), or compose both in app/',
  },
  {
    from: { element: { type: 'store' } },
    disallow: {
      to: {
        element: {
          type: except(
            'store',
            'services',
            'models',
            'core-providers',
            'core-config',
            'core-i18n',
            'testing',
          ),
        },
      },
    },
    message:
      'store/ imports store/, services/, models/, core/providers, core/config and core/i18n only: it never knows pages, components/ or shared/',
  },
  {
    from: { element: { type: 'services' } },
    disallow: {
      to: { element: { type: except('services', 'core-config', 'models', 'testing') } },
    },
    message:
      'services/ imports models/, core/config and services/generated only: it never knows the store, shared/ or any screen',
  },
  {
    from: { element: { type: CORE_WIRING } },
    disallow: { to: { element: { type: ['app', 'components', 'page'] } } },
    message:
      'core wiring (guards, initializers, error and http interceptors) imports store/, services/, core/, shared/ and models/ only: routes and screens are composed in app/',
  },
  {
    // The client config imports the two fetch wrappers, so they import nothing that imports the
    // client: no cycle client → config → wrapper → store → services → client.
    from: { file: { categories: 'fetch-wrapper' } },
    disallow: {
      to: { element: { type: except('core-config', 'core-providers', 'models', 'testing') } },
    },
    message:
      'a fetch wrapper imports core/config, core/providers and models/ only (loading.interceptor.ts adds store/loading.store.ts): it is a leaf of the client config',
  },
  {
    from: { element: { type: 'core-interceptors', fileInternalPath: 'loading.interceptor.ts' } },
    allow: { to: { element: { type: 'store', fileInternalPath: 'loading.store.ts' } } },
  },
  {
    from: { element: { type: CORE_LEAVES } },
    disallow: { to: { element: { type: except(...CORE_LEAVES, 'shared', 'models', 'testing') } } },
    message:
      'core/config, core/providers, core/i18n and core/errors import each other, shared/ and models/ only (core/config/api-client.ts also the two fetch wrappers)',
  },
  {
    from: { element: { type: 'core-config', fileInternalPath: 'api-client.ts' } },
    allow: { to: { file: { categories: 'fetch-wrapper' } } },
  },
  {
    from: { element: { type: 'shared' } },
    disallow: { to: { element: { type: except('shared', 'models', 'testing') } } },
    message:
      'shared/ is product-agnostic: it imports shared/ and models/ only. Move the code to core/, a page module or services/, or pass it in as props',
  },
  {
    from: { element: { type: 'models' } },
    disallow: { to: { element: { type: except('models', 'testing') } } },
    message:
      'models/ imports models/ and the generated contract types (import type) only: the runtime stays in services/',
  },
  {
    // The generated folder: only the data layer reaches it, plus the types of the layers below.
    from: { element: { type: except('services', 'testing') } },
    disallow: { to: { element: { type: 'services-generated' } } },
    message: GENERATED_MESSAGE,
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    from: { element: { type: 'page', fileInternalPath: '*.form.ts' } },
    allow: { to: { element: { type: 'services-generated', fileInternalPath: 'zod.gen.ts' } } },
  },
  {
    // The contract's types reach a layer that is not UI through import type; the runtime stays in services/.
    from: { element: { type: ['store', ...CORE_LEAVES, ...CORE_WIRING, 'models'] } },
    dependency: { kind: 'type' },
    allow: { to: { element: { type: 'services-generated' } } },
  },
  {
    // The one runtime import of the generated client outside services/: it registers the error
    // interceptor on the client.
    from: { element: { type: 'core-interceptors', fileInternalPath: 'http.provider.ts' } },
    allow: { to: { element: { type: 'services-generated' } } },
  },
  {
    from: { element: { type: except('testing') } },
    disallow: { to: { element: { type: 'testing' } } },
    message: 'only a *.spec.ts imports testing/: it holds test helpers and is never bundled',
  },
]

const RAW_CONTROLS = ['button', 'input', 'select', 'textarea'].map((element) => ({
  element,
  message: `<${element}> only inside shared/components/: use <Base${element[0].toUpperCase()}${element.slice(1)}>`,
}))
const NETWORK = [
  {
    selector:
      "CallExpression[callee.name='fetch'], CallExpression[callee.object.name='globalThis'][callee.property.name='fetch'], CallExpression[callee.object.name='window'][callee.property.name='fetch']",
    message:
      'call the API through a facade in services/ (the generated SDK behind it), not fetch: only core/interceptors/auth.interceptor.ts calls fetch',
  },
]
// Configuration is read in one place; Vite exposes it as import.meta.env.
const ENV = [
  {
    selector: "MetaProperty[meta.name='import'][property.name='meta']",
    message: 'Read configuration through src/core/config/env.ts',
  },
]
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

// Only the data layer calls the generated runtime; a type is welcome in the layers below the UI.
const RUNTIME_MESSAGE =
  'only services/ and core/interceptors/http.provider.ts import the generated runtime: add a facade method in services/<module>.service.ts and call it from a store (a type goes through models/)'
const STYLE_MESSAGE =
  'main.ts imports the global styles; a page or component carries a sibling .scss through <style lang="scss" src="./<stem>.scss"></style>'
const GENERATED_GROUP = {
  group: [
    '@/services/generated',
    '@/services/generated/**',
    '**/services/generated',
    '**/services/generated/**',
    '**/generated',
    '**/generated/*',
  ],
  allowTypeImports: true,
  message: RUNTIME_MESSAGE,
}
const STYLE_GROUP = { group: ['**/*.css', '**/*.scss'], message: STYLE_MESSAGE }
const restrictImports = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] })

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
  ...vue.configs['flat/recommended'],
  ...vuejsAccessibility.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
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
    },
  },
  {
    // vue-eslint-parser reads the template and hands the script block to typescript-eslint.
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/block-lang': ['error', { script: { lang: 'ts' }, style: { lang: 'scss' } }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/multi-word-component-names': 'error',
      'vue/no-static-inline-styles': 'error',
      'vue/no-restricted-html-elements': ['error', ...RAW_CONTROLS],
    },
  },
  {
    files: ['src/**'],
    plugins: { boundaries },
    settings: {
      // The TypeScript resolver reads the `@/*` alias from tsconfig.app.json and resolves `.vue`
      // imports; without it a violation is silently missed.
      'import/resolver': {
        typescript: {
          project: `${import.meta.dirname}/tsconfig.app.json`,
          extensions: ['.ts', '.vue', '.d.ts', '.js', '.json'],
        },
      },
      'boundaries/include': ['src/**/*'],
      // A spec file is the consumer the layers exist for: it may import any of them. Specs, the
      // styles tree (not code) and the Vite type shim sit outside the layers.
      'boundaries/ignore': ['src/**/*.spec.ts', 'src/styles/**', 'src/vite-env.d.ts'],
      'boundaries/files': [
        { pattern: 'src/main.ts', category: 'entry' },
        {
          pattern: 'src/core/interceptors/{auth,loading}.interceptor.ts',
          category: 'fetch-wrapper',
        },
      ],
      // A file matches every element that fits, so the nested generated folder stops the search.
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'components', pattern: 'src/components', partialMatch: false },
        { type: 'page', pattern: 'src/pages/*', partialMatch: false, capture: ['page'] },
        { type: 'store', pattern: 'src/store', partialMatch: false },
        {
          type: 'services-generated',
          pattern: 'src/services/generated',
          partialMatch: false,
          stopMatching: true,
        },
        { type: 'services', pattern: 'src/services', partialMatch: false },
        { type: 'core-config', pattern: 'src/core/config', partialMatch: false },
        { type: 'core-providers', pattern: 'src/core/providers', partialMatch: false },
        { type: 'core-i18n', pattern: 'src/core/i18n', partialMatch: false },
        { type: 'core-errors', pattern: 'src/core/errors', partialMatch: false },
        { type: 'core-guards', pattern: 'src/core/guards', partialMatch: false },
        { type: 'core-initializers', pattern: 'src/core/initializers', partialMatch: false },
        { type: 'core-interceptors', pattern: 'src/core/interceptors', partialMatch: false },
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
      ...restrictImports(GENERATED_GROUP, STYLE_GROUP),
      ...restrictSyntax(NETWORK, ENV),
    },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/components/**'],
    rules: { 'vue/no-restricted-html-elements': 'off' },
  },
  {
    // The entry imports the stylesheets, and nothing else.
    files: ['src/main.ts'],
    rules: restrictImports(GENERATED_GROUP),
  },
  {
    // The data layer: the one place the generated runtime is imported.
    files: ['src/services/**'],
    rules: restrictImports(STYLE_GROUP),
  },
  {
    // The generated client is configured by registering the error interceptor on it.
    files: ['src/core/interceptors/http.provider.ts'],
    rules: restrictImports(STYLE_GROUP),
  },
  {
    // A form schema extends the generated zod schemas (limits are never copied).
    files: ['src/pages/*/*.form.ts'],
    rules: restrictImports(
      {
        // A regex, because a negated glob cannot re-include a file under an excluded directory:
        // the barrel, any relative spelling and every generated file except zod.gen.
        regex: '(^|/)generated(/(?!zod[.]gen$).*)?$',
        allowTypeImports: true,
        message: RUNTIME_MESSAGE,
      },
      STYLE_GROUP,
    ),
  },
  {
    // The only file that calls fetch: the 401 refresh replays the request and calls the refresh
    // endpoint itself. It is a leaf: the client config imports it, so it imports no layer that
    // imports the client.
    files: ['src/core/interceptors/auth.interceptor.ts'],
    rules: {
      ...restrictImports(GENERATED_GROUP, STYLE_GROUP, {
        group: [
          '@/store',
          '@/store/**',
          '**/store/**',
          '@/services',
          '@/services/**',
          '**/services/**',
          '@/core/interceptors/**',
          './*.interceptor',
          './http.provider',
        ],
        message:
          'auth.interceptor.ts is a leaf: it imports core/config, core/providers and models/ only (never store/, services/ or another interceptor), so the client config can import it without a cycle',
      }),
      ...restrictSyntax(ENV),
    },
  },
  {
    files: ['src/core/config/env.ts'],
    rules: restrictSyntax(NETWORK),
  },
  {
    // A spec and the test helpers drive the code from outside: they stub and call fetch.
    files: ['src/**/*.spec.ts', 'src/testing/**'],
    rules: { ...restrictImports(), ...restrictSyntax(ENV) },
  },
  {
    files: ['vite.config.ts', 'vitest.config.mts', 'playwright.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The generator keeps one of the returns (the component or null), so in place the second is
    // unreachable on purpose.
    files: ['src/components/slots.ts'],
    rules: { 'no-unreachable': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Last, so it switches off the formatting rules Prettier owns (Vue's included).
  prettier,
])
