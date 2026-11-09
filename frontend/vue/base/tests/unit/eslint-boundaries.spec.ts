// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, describe, expect, it } from 'vitest'

// Lints one snippet per rule through the real eslint.config.mjs. The snippets run in a throwaway
// project of fixture files (every file a snippet imports, plus files the later tasks add), because
// the boundary rule classifies a dependency by the file it resolves to; the features are invented
// here, so adding a real one never breaks the test and a rule that names a file the tree does not
// hold yet is testable. Type-aware linting cannot read virtual files, so the one override turns
// it off; every other rule stays on.
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.app.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'boundaries-'))

const FILES = [
  'src/main.ts',
  'src/app/App.vue',
  'src/app/nav.ts',
  'src/app/plugins.ts',
  'src/app/router.ts',
  'src/app/routes.ts',
  'src/layout/main-layout/main-layout.vue',
  'src/layout/components/slots.ts',
  'src/store/health.store.ts',
  'src/store/loading.store.ts',
  'src/store/theme.store.ts',
  'src/services/health.service.ts',
  'src/services/generated/client.gen.ts',
  'src/services/generated/index.ts',
  'src/services/generated/sdk.gen.ts',
  'src/services/generated/types.gen.ts',
  'src/services/generated/zod.gen.ts',
  'src/core/config/api-client.ts',
  'src/core/config/constants.ts',
  'src/core/config/env.ts',
  'src/core/providers/logger.ts',
  'src/core/providers/session.ts',
  'src/core/i18n/i18n.ts',
  'src/core/errors/global-error-handler.ts',
  'src/core/guards/auth.guard.ts',
  'src/core/guards/unsaved-changes.guard.ts',
  'src/core/initializers/session.initializer.ts',
  'src/core/interceptors/auth.interceptor.ts',
  'src/core/interceptors/error.interceptor.ts',
  'src/core/interceptors/http.provider.ts',
  'src/core/interceptors/loading.interceptor.ts',
  'src/shared/components/base-button.vue',
  'src/shared/utils/time.ts',
  'src/shared/validators/zod-form.ts',
  'src/models/api/response.ts',
  'src/models/health/interface.ts',
  'src/models/nav/interface.ts',
  'src/features/health/health.routes.ts',
  'src/features/health/health.form.ts',
  'src/features/health/pages/health-status-page.vue',
  'src/features/health/components/health-badge.vue',
  'src/features/other/other.routes.ts',
  'src/features/other/pages/other-page.vue',
  'src/testing/render.ts',
]
for (const file of FILES) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(
    join(root, file),
    file.endsWith('.vue') ? '<template><div /></template>\n' : 'export {}\n',
  )
}
writeFileSync(join(root, 'tsconfig.app.json'), tsconfig)

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: config,
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    {
      languageOptions: { parserOptions: { projectService: false, project: null } },
      settings: {
        'boundaries/root-path': root,
        // The alias resolver reads the tsconfig of the project it is given; point it at the
        // throwaway one. The config's own key, so this replaces it instead of adding a second
        // resolver that would still resolve to the real project. `.vue` must resolve too.
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: join(root, 'tsconfig.app.json'),
            extensions: ['.ts', '.vue', '.d.ts', '.js', '.json'],
          },
        },
      },
    },
  ],
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

// A script snippet for a .vue file is wrapped in a single-file component; a whole component
// (it starts with a tag) is linted as written.
function source(filePath: string, code: string): string {
  if (!filePath.endsWith('.vue') || code.startsWith('<'))
    return `${code}
`
  return `<script setup lang="ts">
${code}
</script>
`
}

async function messagesFor(filePath: string, code: string, ruleIds: string | string[]) {
  const wanted = Array.isArray(ruleIds) ? ruleIds : [ruleIds]
  const [result] = await eslint.lintText(source(filePath, code), { filePath: join(root, filePath) })
  const messages = result?.messages ?? []
  // A snippet that does not parse would pass every allowed case vacuously.
  const fatal = messages.find((m) => m.fatal === true)
  if (fatal !== undefined) throw new Error(`${filePath} did not parse: ${fatal.message}`)
  return messages.filter((m) => wanted.includes(m.ruleId ?? '')).map((m) => m.message)
}

const BOUNDARY = 'boundaries/dependencies'
const SYNTAX = 'no-restricted-syntax'
const IMPORTS = 'no-restricted-imports'
const HTML = 'vue/no-restricted-html-elements'
const BLOCK = 'vue/no-restricted-block'
const INLINE = 'vue/no-static-inline-styles'
// Every rule a snippet may trip because of where it sits: an allowed case must trip none.
const GUARDED = [BOUNDARY, SYNTAX, IMPORTS, HTML, BLOCK, INLINE, 'boundaries/no-unknown-files']

const PAGE = 'src/features/health/pages/x.vue'
const COMPONENT = 'src/features/health/components/x.vue'
const ROUTES = 'src/features/health/health.routes.ts'
const FORM = 'src/features/health/health.form.ts'
const AUTH_WRAPPER = 'src/core/interceptors/auth.interceptor.ts'
const LOADING_WRAPPER = 'src/core/interceptors/loading.interceptor.ts'
const ERROR_INTERCEPTOR = 'src/core/interceptors/error.interceptor.ts'
const HTTP_PROVIDER = 'src/core/interceptors/http.provider.ts'
const SFC = (script: string, template = '<div />') =>
  `<script setup lang="ts">\n${script}\n</script>\n<template>\n${template}\n</template>`
const SDK = "import { getApiHealth } from '@/services/generated/sdk.gen'"
const ZOD = "import { zHealthResponse } from '@/services/generated/zod.gen'"
const TYPES = "import type { HealthResponse } from '@/services/generated/types.gen'"

type Violation = [row: string, file: string, code: string, ruleId: string, message: string]
type Allowed = [row: string, file: string, code: string]

// One violation per row of ADR 0008 T1.1 and per restriction listed under it.
const violations: Violation[] = [
  // app/: wiring above everything; a feature only through its routes file.
  [
    'app → services',
    'src/app/x.ts',
    "import '@/services/health.service'",
    BOUNDARY,
    'app/ only wires',
  ],
  [
    'app → testing',
    'src/app/x.ts',
    "import '@/testing/render'",
    BOUNDARY,
    'only a *.spec.ts imports testing/',
  ],
  [
    'app → feature page',
    'src/app/x.ts',
    "import '@/pages/health/health-status-page.vue'",
    BOUNDARY,
    'only through its *.routes.ts',
  ],
  // main.ts is the entry: app, core, shared, models.
  ['main → store', 'src/main.ts', "import '@/store/theme.store'", BOUNDARY, 'main.ts imports app/'],
  [
    'main → layout',
    'src/main.ts',
    "import '@/components/slots'",
    BOUNDARY,
    'main.ts imports app/',
  ],
  [
    'main → services',
    'src/main.ts',
    "import '@/services/health.service'",
    BOUNDARY,
    'main.ts imports app/',
  ],
  // layout/: core/config, core/providers, store, shared, models.
  [
    'layout → app',
    'src/layout/x.ts',
    "import '@/app/nav'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  [
    'layout → feature',
    'src/layout/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  [
    'layout → services',
    'src/layout/x.ts',
    "import '@/services/health.service'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  [
    'layout → core/guards',
    'src/layout/x.ts',
    "import '@/core/guards/auth.guard'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  [
    'layout → core/i18n',
    'src/layout/x.ts',
    "import '@/core/i18n/i18n'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  // features/<f>/pages: store, shared, models, core/config, core/providers, core/guards.
  [
    'page → services',
    PAGE,
    "import '@/services/health.service'",
    BOUNDARY,
    'a page reads a store, never services/',
  ],
  ['page → app', PAGE, "import '@/app/nav'", BOUNDARY, 'a page reads a store'],
  ['page → layout', PAGE, "import '@/components/slots'", BOUNDARY, 'a page reads a store'],
  [
    'page → core/interceptors',
    PAGE,
    "import '@/core/interceptors/error.interceptor'",
    BOUNDARY,
    'a page reads a store',
  ],
  [
    'page → testing',
    PAGE,
    "import '@/testing/render'",
    BOUNDARY,
    'only a *.spec.ts imports testing/',
  ],
  [
    'feature → other feature',
    PAGE,
    "import '@/pages/other/other-page.vue'",
    BOUNDARY,
    'a feature never imports another feature',
  ],
  [
    'feature → other feature (relative path)',
    PAGE,
    "import '../../other/pages/other-page.vue'",
    BOUNDARY,
    'a feature never imports another feature',
  ],
  // features/<f>/components: shared, models.
  [
    'component → store',
    COMPONENT,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a feature component imports shared/ and models/ only',
  ],
  [
    'component → core/config',
    COMPONENT,
    "import '@/core/config/constants'",
    BOUNDARY,
    'a feature component imports shared/ and models/ only',
  ],
  // features/<f>/*.routes.ts: core/guards and its own pages.
  [
    'routes → store',
    ROUTES,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a *.routes.ts imports core/guards and its own pages only',
  ],
  [
    'routes → shared',
    ROUTES,
    "import '@/shared/utils/time'",
    BOUNDARY,
    'a *.routes.ts imports core/guards and its own pages only',
  ],
  // features/<f>/*.form.ts: shared/validators, models, generated zod.
  [
    'form → services',
    FORM,
    "import '@/services/health.service'",
    BOUNDARY,
    'a *.form.ts imports shared/validators',
  ],
  [
    'form → store',
    FORM,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a *.form.ts imports shared/validators',
  ],
  [
    'form → shared/components',
    FORM,
    "import '@/shared/components/base-button.vue'",
    BOUNDARY,
    'a *.form.ts imports shared/validators',
  ],
  [
    'form → generated sdk (value)',
    FORM,
    SDK,
    IMPORTS,
    'only services/ and core/interceptors/http.provider.ts',
  ],
  // store/: store, services, models, core/providers, core/config, core/i18n.
  [
    'store → shared',
    'src/store/x.ts',
    "import '@/shared/utils/time'",
    BOUNDARY,
    'store/ imports store/, services/',
  ],
  [
    'store → feature',
    'src/store/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'store/ imports store/, services/',
  ],
  [
    'store → core/guards',
    'src/store/x.ts',
    "import '@/core/guards/auth.guard'",
    BOUNDARY,
    'store/ imports store/, services/',
  ],
  [
    'store → core/interceptors',
    'src/store/x.ts',
    "import '@/core/interceptors/http.provider'",
    BOUNDARY,
    'store/ imports store/, services/',
  ],
  // services/: models, core/config, services/generated.
  [
    'services → store',
    'src/services/x.ts',
    "import '@/store/health.store'",
    BOUNDARY,
    'services/ imports models/, core/config',
  ],
  [
    'services → core/providers',
    'src/services/x.ts',
    "import '@/core/providers/logger'",
    BOUNDARY,
    'services/ imports models/, core/config',
  ],
  [
    'services → shared',
    'src/services/x.ts',
    "import '@/shared/utils/time'",
    BOUNDARY,
    'services/ imports models/, core/config',
  ],
  // core wiring: guards, initializers, error and http interceptors.
  [
    'core/guards → app',
    'src/core/guards/x.ts',
    "import '@/app/router'",
    BOUNDARY,
    'core wiring (guards, initializers',
  ],
  [
    'core/initializers → feature',
    'src/core/initializers/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'core wiring (guards, initializers',
  ],
  [
    'core/interceptors/error → layout',
    ERROR_INTERCEPTOR,
    "import '@/components/slots'",
    BOUNDARY,
    'core wiring (guards, initializers',
  ],
  [
    'core/guards → generated sdk (value)',
    'src/core/guards/x.ts',
    SDK,
    BOUNDARY,
    "read the contract's types through models/",
  ],
  [
    'error.interceptor → generated client (value)',
    ERROR_INTERCEPTOR,
    "import { client } from '@/services/generated/client.gen'",
    IMPORTS,
    'only services/ and core/interceptors/http.provider.ts',
  ],
  // the fetch wrappers: leaves of the client config.
  [
    'loading wrapper → services',
    LOADING_WRAPPER,
    "import '@/services/health.service'",
    BOUNDARY,
    'a fetch wrapper imports core/config, core/providers and models/ only',
  ],
  [
    'loading wrapper → other store',
    LOADING_WRAPPER,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a fetch wrapper imports core/config, core/providers and models/ only',
  ],
  [
    'auth wrapper → store',
    AUTH_WRAPPER,
    "import '@/store/loading.store'",
    BOUNDARY,
    'a fetch wrapper imports core/config, core/providers and models/ only',
  ],
  [
    'auth wrapper → store (no-restricted-imports)',
    AUTH_WRAPPER,
    "import '@/store/loading.store'",
    IMPORTS,
    'auth.interceptor.ts is a leaf',
  ],
  [
    'auth wrapper → services (no-restricted-imports)',
    AUTH_WRAPPER,
    "import '@/services/health.service'",
    IMPORTS,
    'auth.interceptor.ts is a leaf',
  ],
  [
    'auth wrapper → other interceptor',
    AUTH_WRAPPER,
    "import '@/core/interceptors/error.interceptor'",
    IMPORTS,
    'auth.interceptor.ts is a leaf',
  ],
  // core/config, providers, i18n, errors: each other, shared, models.
  [
    'core/config → store',
    'src/core/config/x.ts',
    "import '@/store/theme.store'",
    BOUNDARY,
    'core/config, core/providers, core/i18n and core/errors',
  ],
  [
    'core/providers → services',
    'src/core/providers/x.ts',
    "import '@/services/health.service'",
    BOUNDARY,
    'core/config, core/providers, core/i18n and core/errors',
  ],
  [
    'core/i18n → guards',
    'src/core/i18n/x.ts',
    "import '@/core/guards/auth.guard'",
    BOUNDARY,
    'core/config, core/providers, core/i18n and core/errors',
  ],
  [
    'core/errors → store',
    'src/core/errors/x.ts',
    "import '@/store/theme.store'",
    BOUNDARY,
    'core/config, core/providers, core/i18n and core/errors',
  ],
  [
    'core/config (not api-client) → fetch wrapper',
    'src/core/config/x.ts',
    "import '@/core/interceptors/loading.interceptor'",
    BOUNDARY,
    'core/config, core/providers, core/i18n and core/errors',
  ],
  [
    'core/config → generated sdk (value)',
    'src/core/config/x.ts',
    SDK,
    BOUNDARY,
    "read the contract's types through models/",
  ],
  // shared/: shared, models.
  [
    'shared → core',
    'src/shared/utils/x.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → store',
    'src/shared/components/x.ts',
    "import '@/store/theme.store'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → services',
    'src/shared/validators/x.ts',
    "import '@/services/health.service'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → feature',
    'src/shared/components/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  // models/: models; generated types by import type only.
  [
    'models → shared',
    'src/models/x.ts',
    "import '@/shared/utils/time'",
    BOUNDARY,
    'models/ imports models/ and the generated contract types',
  ],
  [
    'models → core',
    'src/models/x.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
    'models/ imports models/ and the generated contract types',
  ],
  [
    'models → generated (value)',
    'src/models/x.ts',
    SDK,
    BOUNDARY,
    "read the contract's types through",
  ],
  // the generated runtime, outside the data layer.
  [
    'page → generated sdk',
    PAGE,
    SDK,
    IMPORTS,
    'only services/ and core/interceptors/http.provider.ts',
  ],
  [
    'store → generated sdk (value)',
    'src/store/x.ts',
    SDK,
    IMPORTS,
    'only services/ and core/interceptors/http.provider.ts',
  ],
  [
    'shared → generated types',
    'src/shared/utils/x.ts',
    TYPES,
    BOUNDARY,
    "read the contract's types through",
  ],
  ['page → generated types', PAGE, TYPES, BOUNDARY, "read the contract's types through"],
  [
    'form → generated barrel',
    FORM,
    "import { zHealthResponse } from '@/services/generated'",
    IMPORTS,
    'only services/ and core/interceptors/http.provider.ts',
  ],
  // testing/: only a *.spec.ts imports it.
  [
    'store → testing',
    'src/store/x.ts',
    "import '@/testing/render'",
    BOUNDARY,
    'only a *.spec.ts imports testing/',
  ],
  [
    'shared → testing',
    'src/shared/utils/x.ts',
    "import '@/testing/render'",
    BOUNDARY,
    'only a *.spec.ts imports testing/',
  ],
  // the other restrictions.
  [
    'fetch( in a store',
    'src/store/x.ts',
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through a facade in services/',
  ],
  [
    'globalThis.fetch( in the client config',
    'src/core/config/api-client.ts',
    "await globalThis.fetch('/api/health')",
    SYNTAX,
    'call the API through a facade in services/',
  ],
  [
    'fetch( in the loading wrapper',
    LOADING_WRAPPER,
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through a facade in services/',
  ],
  [
    'import.meta in a store',
    'src/store/x.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
    'Read configuration through src/core/config/env.ts',
  ],
  [
    'a stylesheet import in a component',
    PAGE,
    SFC("import '@/styles/styles.scss'"),
    IMPORTS,
    'styles live in src/styles/',
  ],
  [
    'a css import in a store',
    'src/store/x.ts',
    "import '@/styles/themes/brand.css'",
    IMPORTS,
    'styles live in src/styles/',
  ],
  [
    '<button> in a page',
    PAGE,
    SFC('', '<button type="button">x</button>'),
    HTML,
    '<button> only inside shared/components/',
  ],
  [
    '<input> in a layout',
    'src/layout/x.vue',
    SFC('', '<input />'),
    HTML,
    '<input> only inside shared/components/',
  ],
  [
    '<select> in a page',
    PAGE,
    SFC('', '<select />'),
    HTML,
    '<select> only inside shared/components/',
  ],
  [
    '<textarea> in a page',
    PAGE,
    SFC('', '<textarea />'),
    HTML,
    '<textarea> only inside shared/components/',
  ],
  [
    'a <style> block',
    PAGE,
    `${SFC('')}\n<style>p { color: red }</style>`,
    BLOCK,
    'no <style> block',
  ],
  ['a static style attribute', PAGE, SFC('', '<p style="color: red" />'), INLINE, ''],
  [
    'a file in a directory no layer claims',
    'src/hooks/use-thing.ts',
    'export {}',
    'boundaries/no-unknown-files',
    '',
  ],
]

// One allowed case per row, so a rule cannot be satisfied by refusing everything.
const allowed: Allowed[] = [
  [
    'app → layout, store, shared, models, core',
    'src/app/x.ts',
    "import '@/components/slots'; import '@/store/theme.store'; import '@/shared/utils/time'; import '@/models/nav/interface'; import '@/core/config/env'; import '@/core/guards/auth.guard'",
  ],
  ['app → a feature *.routes.ts', 'src/app/x.ts', "import '@/pages/health/health.routes'"],
  [
    'main → app, core, shared, models',
    'src/main.ts',
    "import '@/app/plugins'; import '@/core/config/env'; import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  [
    'layout → core/config, core/providers, store, shared, models',
    'src/layout/x.ts',
    "import '@/core/config/constants'; import '@/core/providers/logger'; import '@/store/theme.store'; import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  ['layout → shared component', 'src/layout/x.ts', "import '@/shared/components/base-button.vue'"],
  [
    'page → store, shared, models, core/config, core/providers, core/guards',
    PAGE,
    "import '@/store/health.store'; import '@/shared/utils/time'; import '@/models/health/interface'; import '@/core/config/constants'; import '@/core/providers/logger'; import '@/core/guards/unsaved-changes.guard'",
  ],
  ['page → its own component', PAGE, "import '../components/health-badge.vue'"],
  ['page → its own form', PAGE, "import '../health.form'"],
  ['page → generated types by an alias model', PAGE, "import '@/models/health/interface'"],
  [
    'component → shared, models',
    COMPONENT,
    "import '@/shared/components/base-button.vue'; import '@/models/health/interface'",
  ],
  [
    'routes → core/guards and its own pages',
    ROUTES,
    "import '@/core/guards/auth.guard'; import('./pages/health-status-page.vue')",
  ],
  [
    'form → shared/validators, models, generated zod',
    FORM,
    `${ZOD}; import '@/shared/validators/zod-form'; import '@/models/health/interface'`,
  ],
  [
    'store → store, services, models, core/providers, core/config',
    'src/store/x.ts',
    "import '@/store/loading.store'; import '@/services/health.service'; import '@/models/health/interface'; import '@/core/providers/logger'; import '@/core/config/env'",
  ],
  [
    'store → core/i18n',
    'src/store/x.ts',
    "import '@/core/i18n/i18n'; import '@/core/i18n/languages'",
  ],
  ['store → generated (import type)', 'src/store/x.ts', TYPES],
  [
    'services → models, core/config, services/generated',
    'src/services/x.ts',
    `${SDK}; import '@/models/health/interface'; import '@/core/config/constants'`,
  ],
  [
    'services → generated barrel',
    'src/services/x.ts',
    "import { getApiHealth } from '@/services/generated'",
  ],
  [
    'core/guards → store, services, core, shared, models',
    'src/core/guards/x.ts',
    "import '@/store/health.store'; import '@/services/health.service'; import '@/core/providers/session'; import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  [
    'core/initializers → store, core, models',
    'src/core/initializers/x.ts',
    "import '@/store/theme.store'; import '@/core/providers/session'; import '@/models/nav/interface'",
  ],
  [
    'error.interceptor → store, models, core',
    ERROR_INTERCEPTOR,
    "import '@/store/theme.store'; import '@/models/api/response'; import '@/core/providers/logger'",
  ],
  ['error.interceptor → generated (import type)', ERROR_INTERCEPTOR, TYPES],
  [
    'http.provider → the generated client runtime',
    HTTP_PROVIDER,
    "import { client } from '@/services/generated/client.gen'; import '@/core/interceptors/error.interceptor'",
  ],
  [
    'loading wrapper → store/loading.store.ts, core/config, core/providers, models',
    LOADING_WRAPPER,
    "import '@/store/loading.store'; import '@/core/config/env'; import '@/core/providers/logger'; import '@/models/api/response'",
  ],
  [
    'auth wrapper → core/config, core/providers, models',
    AUTH_WRAPPER,
    "import '@/core/config/constants'; import '@/core/providers/session'; import '@/models/api/response'",
  ],
  [
    'auth wrapper calls the global fetch',
    AUTH_WRAPPER,
    "await fetch('/api/auth/refresh'); await globalThis.fetch('/api/auth/refresh')",
  ],
  [
    'core/config → core/providers, core/i18n, core/errors, shared, models',
    'src/core/config/x.ts',
    "import '@/core/providers/logger'; import '@/core/i18n/i18n'; import '@/core/errors/global-error-handler'; import '@/shared/utils/time'; import '@/models/api/response'",
  ],
  [
    'api-client → the two fetch wrappers',
    'src/core/config/api-client.ts',
    "import { withLoading } from '@/core/interceptors/loading.interceptor'; import { withRefresh } from '@/core/interceptors/auth.interceptor'",
  ],
  ['api-client → generated (import type)', 'src/core/config/api-client.ts', TYPES],
  [
    'core/providers → core/config, shared, models',
    'src/core/providers/x.ts',
    "import '@/core/config/constants'; import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  ['core/i18n → core/config', 'src/core/i18n/x.ts', "import '@/core/config/constants'"],
  [
    'core/errors → core/providers, shared',
    'src/core/errors/x.ts',
    "import '@/core/providers/logger'; import '@/shared/utils/time'",
  ],
  [
    'shared → shared, models',
    'src/shared/components/x.ts',
    "import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  ['models → models', 'src/models/x.ts', "import '@/models/nav/interface'"],
  ['models → generated (import type)', 'src/models/x.ts', TYPES],
  [
    'testing → anything',
    'src/testing/x.ts',
    "import '@/pages/health/health.routes'; import '@/app/nav'; import '@/store/theme.store'; import '@/services/health.service'",
  ],
  [
    'a spec → testing and any layer',
    'src/features/health/pages/x.spec.ts',
    "import '@/testing/render'; import '@/services/health.service'",
  ],
  ['import.meta in env.ts', 'src/core/config/env.ts', 'export const v = import.meta.env.MODE'],
  [
    'a stylesheet import in main.ts',
    'src/main.ts',
    "import '@/styles/themes/brand.css'; import '@/styles/styles.scss'",
  ],
  [
    '<button> in shared/components',
    'src/shared/components/x.vue',
    SFC('', '<button type="button">x</button><input /><select /><textarea />'),
  ],
  [
    'a component tag <BaseButton> in a page',
    PAGE,
    SFC("import BaseButton from '@/shared/components/base-button.vue'", '<BaseButton />'),
  ],
  ['a script-only page', PAGE, SFC('const a = 1\nexport {}\nvoid a')],
  ['files in a claimed directory', 'src/shared/utils/x.ts', 'export {}'],
]

// The first lint loads the whole config (type-aware presets, plugins), which can take seconds.
describe('lint rules', { timeout: 60_000 }, () => {
  // The allowed cases pass vacuously if the rule stopped firing, so pin one known violation.
  it('still reports exactly one boundaries message for shared → feature', async () => {
    const found = await messagesFor(
      'src/shared/components/x.ts',
      "import '@/pages/health/health.routes'",
      BOUNDARY,
    )
    expect(found).toHaveLength(1)
  })

  it.each(violations)('%s is refused', async (_row, file, code, ruleId, message) => {
    const found = await messagesFor(file, code, ruleId)
    expect(found.length).toBeGreaterThanOrEqual(1)
    expect(found.some((text) => text.includes(message))).toBe(true)
  })

  it.each(allowed)('%s is allowed', async (_row, file, code) => {
    const found = await messagesFor(file, code, GUARDED)
    expect(found).toEqual([])
  })
})

describe('files outside every layer', { timeout: 60_000 }, () => {
  it.each(['src/lib/format.ts', 'src/utils/format.ts', 'src/stray.ts', 'src/hooks/use-thing.ts'])(
    '%s is refused',
    async (file) => {
      expect(await messagesFor(file, 'export {}', 'boundaries/no-unknown-files')).toHaveLength(1)
    },
  )

  it.each(['src/main.ts', 'src/vite-env.d.ts', 'src/shared/utils/x.ts', 'src/models/x.ts'])(
    '%s is allowed',
    async (file) => {
      expect(await messagesFor(file, 'export {}', 'boundaries/no-unknown-files')).toEqual([])
    },
  )
})
