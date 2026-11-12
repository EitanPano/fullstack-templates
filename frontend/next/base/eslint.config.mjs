import boundaries from 'eslint-plugin-boundaries'
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tseslint from 'typescript-eslint'

import { clientServerImport } from './eslint-rules/client-server-import.mjs'
import { routeComponents } from './eslint-rules/route-components.mjs'

// The layer map (AGENTS.md › Layers): app → layout → actions → services → core → shared →
// models, each layer importing only what the table allows. Every import the layers forbid is a
// `boundaries/dependencies` error whose message names the layer to use. A file under src/ that no
// layer claims is a `boundaries/no-unknown-files` error. tests/unit/eslint-boundaries.test.ts
// lints one violation and one allowed case per rule through this file, so a rule that stops
// firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for that file. `no-restricted-syntax` is therefore built
// from the selector lists below and each block states every selector that applies to it.
const ALL = [
  'app',
  'layout',
  'actions',
  'services',
  'services-generated',
  'store',
  'core',
  'shared',
  'models',
]
const except = (...types) => ALL.filter((type) => !types.includes(type))

// Later policies override earlier ones, so each forbidden edge comes first and its exceptions after.
// The generated client's functions are imported by services/ alone; every other layer reads the
// contract's types (import type) and actions/ takes the zod schemas it extends.
const policies = [
  {
    from: { element: { type: except('app') } },
    disallow: { to: { element: { type: 'app' } } },
    message:
      'only app/ is allowed to import app/: routes compose layout and shared components, nothing imports a route',
  },
  {
    from: { element: { type: 'actions' } },
    disallow: { to: { element: { type: ['layout', 'store'] } } },
    message:
      'actions/ imports services/, core/, shared/ and models/ only: an action is a server mutation, it never knows layout/ or the store',
  },
  {
    from: { element: { type: 'services' } },
    disallow: { to: { element: { type: ['layout', 'actions', 'store', 'shared'] } } },
    message:
      'services/ imports services/, core/ and models/ only: it reads data, it never knows layout/, an action, the store or shared/',
  },
  {
    from: { element: { type: 'store' } },
    disallow: { to: { element: { type: ['layout', 'actions', 'services'] } } },
    message:
      'store/ imports core/, shared/ and models/ only: client state never reads data or calls an action; do that in layout/ or a route',
  },
  {
    from: { element: { type: 'core' } },
    disallow: { to: { element: { type: ['layout', 'actions', 'store'] } } },
    message:
      'core/ imports services/, shared/, models/ and core/ only: the session and the config sit below actions, layout/ and the store',
  },
  {
    from: { element: { type: 'shared' } },
    disallow: { to: { element: { type: except('shared', 'models') } } },
    message:
      'shared/ is product-agnostic: it imports shared/ and models/ only. Move the code to layout/, core/ or services/, or pass it in as props',
  },
  {
    from: { element: { type: 'models' } },
    disallow: { to: { element: { type: except('models') } } },
    message:
      'models/ imports models/ and the generated contract (import type only) only: a schema or a helper is not an entity file, the runtime stays in services/',
  },
  {
    from: { element: { type: ['app', 'layout', 'store', 'shared'] } },
    disallow: { to: { element: { type: 'services-generated' } } },
    message:
      "read the contract's types through models/<entity>/type.ts; only services/ imports the generated client's functions",
  },
  {
    from: { element: { type: ['actions', 'core'] } },
    disallow: { to: { element: { type: 'services-generated' } } },
    message:
      "call the API through services/<entity>.ts; only services/ imports the generated client's functions",
  },
  {
    // The contract's types reach models/, actions/ and core/ through import type; the runtime
    // stays in services/.
    from: { element: { type: ['models', 'actions', 'core'] } },
    dependency: { kind: 'type' },
    allow: { to: { element: { type: 'services-generated' } } },
  },
  {
    // A form schema extends the generated zod schema (limits are never copied).
    from: { element: { type: ['actions', 'core'] } },
    allow: { to: { element: { type: 'services-generated', fileInternalPath: 'zod.gen.ts' } } },
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
      "CallExpression[callee.name='fetch'], CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
    message: 'call the API through services/ (the typed client behind a read), not fetch',
  },
  {
    selector: "CallExpression[callee.name='revalidatePath']",
    message:
      'revalidatePath is reserved to services/: use refresh() from next/cache in an action, or updateTag for a tagged read',
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
// A stylesheet import is the owner's sibling `./<stem>.scss`; only app/layout.tsx, and
// app/global-error.tsx which replaces it, load the global tree from src/styles/.
const STYLESHEETS = [
  {
    group: ['@/styles/**', '**/styles/**'],
    message: 'only src/app/layout.tsx and src/app/global-error.tsx load the global style tree',
  },
  {
    // The styles tree has its own pattern (and message) above; it is not reported twice.
    group: [
      '@/**/*.scss',
      '@/**/*.css',
      '../**/*.scss',
      '../**/*.css',
      '**/*.css',
      '!@/styles/**',
      '!**/styles/**',
    ],
    message: "import the component's own sibling sheet, './<stem>.scss'",
  },
]
// An external library is imported by its facade alone, so a library switch rewrites that file
// (for zod also the plugin behind services/generated/zod.gen.ts, which lint ignores). The kit
// libraries (radix-ui, react-hook-form) are imported across the folder that wraps them.
const library = (modules, message) => ({
  group: modules.flatMap((name) => [name, `${name}/**`]),
  message,
})
const VALIDATION_LIBRARY = library(
  ['zod', '@hookform/resolvers'],
  "build and run a schema through '@/shared/utils/validation'",
)
const ICON_LIBRARY = library(['lucide-react'], "import an icon from '@/shared/components/icons'")
const TOAST_LIBRARY = library(
  ['sonner'],
  "show a toast with toastError from '@/shared/components/toaster/toaster'",
)
const THEME_LIBRARY = library(
  ['next-themes'],
  "use ThemeProvider and useAppTheme from '@/shared/components/theme/theme'",
)
const ACTION_LIBRARY = library(
  ['next-safe-action', '@next-safe-action'],
  "define an action in '@/core/actions/safe-action' (field errors: '@/core/actions/field-errors'); run one with useServerAction or useActionForm from '@/shared/components/form/action-form/action-form'",
)
const FORM_LIBRARY = library(
  ['react-hook-form'],
  'react-hook-form is used inside src/shared/components/form/ only: build a form with the form components',
)
const KIT_LIBRARY = library(
  ['radix-ui', '@radix-ui'],
  'radix-ui is used inside src/shared/components/ only: wrap the primitive there',
)
const CLASS_LIBRARY = library(['clsx'], "compose class names with cn from '@/shared/utils/cn'")
const DATE_LIBRARY = library(
  ['date-fns', '@date-fns'],
  "format and shift dates through '@/shared/utils/date'",
)
const LIBRARIES = {
  validation: VALIDATION_LIBRARY,
  icon: ICON_LIBRARY,
  toast: TOAST_LIBRARY,
  theme: THEME_LIBRARY,
  action: ACTION_LIBRARY,
  form: FORM_LIBRARY,
  kit: KIT_LIBRARY,
  cls: CLASS_LIBRARY,
  date: DATE_LIBRARY,
}
// Every library's restriction except the named ones: a facade file lifts only its own.
const librariesExcept = (...names) =>
  Object.entries(LIBRARIES)
    .filter(([name]) => !names.includes(name))
    .map(([, pattern]) => pattern)
const restrictImports = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
})
const restrictSyntax = (...selectors) => ({
  'no-restricted-syntax': ['error', ...selectors.flat()],
})

export default defineConfig([
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'src/services/generated/**',
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
      // models/<entity>/interface.ts holds interfaces and every other file a type alias, so the
      // file names mean what they say (the override below).
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
          message: 'Read configuration through src/core/config/env.ts',
        },
      ],
    },
  },
  {
    files: ['src/**'],
    plugins: {
      boundaries,
      local: {
        rules: { 'client-server-import': clientServerImport, 'route-components': routeComponents },
      },
    },
    settings: {
      // eslint-config-next already registers the TypeScript resolver, which reads the `@/*`
      // alias from tsconfig.json.
      'boundaries/include': ['src/**/*'],
      // A test file is the consumer the layers exist for: it may import any of them. The proxy is
      // Next's own entry file and sits outside the layers.
      // The styles tree is CSS, not code, and sits outside the layers.
      'boundaries/ignore': ['src/**/*.test.{ts,tsx}', 'src/proxy.ts', 'src/styles/**'],
      // A file matches every element that fits, so the nested generated folder stops the search.
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'layout', pattern: 'src/layout', partialMatch: false },
        { type: 'actions', pattern: 'src/actions', partialMatch: false },
        {
          type: 'services-generated',
          pattern: 'src/services/generated',
          partialMatch: false,
          stopMatching: true,
        },
        { type: 'services', pattern: 'src/services', partialMatch: false },
        { type: 'store', pattern: 'src/store', partialMatch: false },
        { type: 'core', pattern: 'src/core', partialMatch: false },
        { type: 'shared', pattern: 'src/shared', partialMatch: false },
        { type: 'models', pattern: 'src/models', partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'allow', policies }],
      // A file in a directory no layer claims (src/lib, src/helper, a stray file under src/) is an
      // error: put it in a layer from AGENTS.md › Layers.
      'boundaries/no-unknown-files': 'error',
      'local/client-server-import': 'error',
      'local/route-components': 'error',
      ...restrictSyntax(RAW_CONTROLS, NETWORK, STYLE),
      ...restrictImports(...STYLESHEETS, ...librariesExcept()),
    },
  },
  {
    files: ['src/models/*/interface.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': ['error', 'interface'] },
  },
  {
    // The browser controls live here, wrapped once; everything else uses the wrappers.
    files: ['src/shared/components/**'],
    rules: restrictSyntax(NETWORK, STYLE),
  },
  {
    // The typed client is the one place that names fetch and revalidates.
    files: ['src/services/**'],
    rules: restrictSyntax(RAW_CONTROLS, STYLE),
  },
  {
    // The two files that load the global style tree: the root layout and global-error.tsx, which
    // renders its own document when the layout fails.
    files: ['src/app/layout.tsx', 'src/app/global-error.tsx'],
    rules: restrictImports(...librariesExcept()),
  },
  // Facades: each file below lifts the restriction of its own library and keeps the rest. A
  // block replaces the rule for its files, so a file matched by two of them (the kit, then the
  // form folder, then a facade inside it) states everything it may import.
  {
    files: ['src/shared/components/**'],
    rules: restrictImports(...STYLESHEETS, ...librariesExcept('kit')),
  },
  {
    files: ['src/shared/components/form/**'],
    rules: restrictImports(...STYLESHEETS, ...librariesExcept('kit', 'form')),
  },
  {
    files: ['src/shared/components/form/action-form/action-form.ts'],
    rules: restrictImports(...STYLESHEETS, ...librariesExcept('form', 'action')),
  },
  ...[
    ['src/shared/utils/validation.ts', 'validation'],
    ['src/shared/utils/cn.ts', 'cls'],
    ['src/shared/utils/date.ts', 'date'],
    ['src/shared/components/icons.ts', 'icon'],
    ['src/shared/components/toaster/toaster.tsx', 'toast'],
    ['src/shared/components/theme/theme.tsx', 'theme'],
    ['src/core/actions/safe-action.ts', 'action'],
    ['src/core/actions/field-errors.ts', 'action'],
  ].map(([file, name]) => ({
    files: [file],
    rules: restrictImports(...STYLESHEETS, ...librariesExcept(name)),
  })),
  {
    files: [
      'src/core/config/env.ts',
      'playwright.config.ts',
      'vitest.config.mts',
      'scripts/**',
      'tests/**',
      'src/**/*.test.{ts,tsx}',
    ],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // A test renders what it likes: the layers and the control wrappers are for shipped code.
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.mjs', '**/*.mts', '*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
])
