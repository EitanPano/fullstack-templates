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
// the boundary rule classifies a dependency by the file it resolves to; the page modules are invented
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
  'src/layout/app-main-layout/app-main-layout.vue',
  'src/layout/app-theme-toggle/app-theme-toggle.vue',
  'src/store/post.store.ts',
  'src/store/loading.store.ts',
  'src/store/theme.store.ts',
  'src/services/post.service.ts',
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
  'src/shared/components/base-button/base-button.vue',
  'src/shared/utils/time.ts',
  'src/shared/validators/zod-form.ts',
  'src/models/api/type.ts',
  'src/models/post/interface.ts',
  'src/models/nav/interface.ts',
  'src/pages/post/post.routes.ts',
  'src/pages/post/post.form.ts',
  'src/pages/post/post-page/post-page.vue',
  'src/pages/post/post-badge/post-badge.vue',
  'src/pages/other/other.routes.ts',
  'src/pages/other/other-page/other-page.vue',
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
const BLOCK = 'vue/block-lang'
const INLINE = 'vue/no-static-inline-styles'
const TYPE_DEFINITION = '@typescript-eslint/consistent-type-definitions'
// Every rule a snippet may trip because of where it sits: an allowed case must trip none.
const GUARDED = [
  BOUNDARY,
  SYNTAX,
  IMPORTS,
  HTML,
  BLOCK,
  INLINE,
  TYPE_DEFINITION,
  'boundaries/no-unknown-files',
]

const PAGE = 'src/pages/post/x-page/x-page.vue'
const COMPONENT = 'src/pages/post/x-badge/x-badge.vue'
const ROUTES = 'src/pages/post/post.routes.ts'
const FORM = 'src/pages/post/post.form.ts'
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

// One violation per row of the layer table and per restriction listed under it.
const violations: Violation[] = [
  // app/: wiring above everything; a page module only through its routes file.
  [
    'app → services',
    'src/app/x.ts',
    "import '@/services/post.service'",
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
    'app → page module file',
    'src/app/x.ts',
    "import '@/pages/post/post-page/post-page.vue'",
    BOUNDARY,
    'only through its *.routes.ts',
  ],
  // main.ts is the entry: app, core, shared, models.
  ['main → store', 'src/main.ts', "import '@/store/theme.store'", BOUNDARY, 'main.ts imports app/'],
  [
    'main → layout',
    'src/main.ts',
    "import '@/layout/app-theme-toggle/app-theme-toggle.vue'",
    BOUNDARY,
    'main.ts imports app/',
  ],
  [
    'main → services',
    'src/main.ts',
    "import '@/services/post.service'",
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
    'layout → page module',
    'src/layout/x.ts',
    "import '@/pages/post/post.routes'",
    BOUNDARY,
    'layout/ imports core/config',
  ],
  [
    'layout → services',
    'src/layout/x.ts',
    "import '@/services/post.service'",
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
  // pages/<m>/*.vue: store, shared, models, core/config, core/providers, core/guards.
  [
    'page → services',
    PAGE,
    "import '@/services/post.service'",
    BOUNDARY,
    'a page reads a store, never services/',
  ],
  [
    'page-local .ts → services',
    'src/pages/post/use-x.ts',
    "import '@/services/post.service'",
    BOUNDARY,
    'a page reads a store, never services/',
  ],
  ['page → app', PAGE, "import '@/app/nav'", BOUNDARY, 'a page reads a store'],
  [
    'page → layout',
    PAGE,
    "import '@/layout/app-theme-toggle/app-theme-toggle.vue'",
    BOUNDARY,
    'a page reads a store',
  ],
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
    'page module → other page module',
    PAGE,
    "import '@/pages/other/other-page/other-page.vue'",
    BOUNDARY,
    'a page module never imports another page module',
  ],
  [
    'page module → other page module (relative path)',
    PAGE,
    "import '../../other/other-page/other-page.vue'",
    BOUNDARY,
    'a page module never imports another page module',
  ],
  // pages/<m>/<name>/ beside a *-page: shared, models.
  [
    'component → store',
    COMPONENT,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a page component imports shared/ and models/ only',
  ],
  [
    'component → core/config',
    COMPONENT,
    "import '@/core/config/constants'",
    BOUNDARY,
    'a page component imports shared/ and models/ only',
  ],
  // pages/<m>/*.routes.ts: core/guards and its own page module.
  [
    'routes → store',
    ROUTES,
    "import '@/store/theme.store'",
    BOUNDARY,
    'a *.routes.ts imports core/guards and its own page module only',
  ],
  [
    'routes → shared',
    ROUTES,
    "import '@/shared/utils/time'",
    BOUNDARY,
    'a *.routes.ts imports core/guards and its own page module only',
  ],
  // pages/<m>/*.form.ts: shared/validators, models, generated zod.
  [
    'form → services',
    FORM,
    "import '@/services/post.service'",
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
    "import '@/shared/components/base-button/base-button.vue'",
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
    'store → page module',
    'src/store/x.ts',
    "import '@/pages/post/post.routes'",
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
    "import '@/store/post.store'",
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
    'core/initializers → page module',
    'src/core/initializers/x.ts',
    "import '@/pages/post/post.routes'",
    BOUNDARY,
    'core wiring (guards, initializers',
  ],
  [
    'core/interceptors/error → layout',
    ERROR_INTERCEPTOR,
    "import '@/layout/app-theme-toggle/app-theme-toggle.vue'",
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
    "import '@/services/post.service'",
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
    "import '@/services/post.service'",
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
    "import '@/services/post.service'",
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
    "import '@/services/post.service'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → page module',
    'src/shared/components/x.ts',
    "import '@/pages/post/post.routes'",
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
    'main.ts imports the global styles',
  ],
  [
    'a css import in a store',
    'src/store/x.ts',
    "import '@/styles/themes/brand.css'",
    IMPORTS,
    'main.ts imports the global styles',
  ],
  [
    '<button> in a page',
    PAGE,
    SFC('', '<button type="button">x</button>'),
    HTML,
    '<button> only inside shared/components/',
  ],
  [
    '<input> in layout/',
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
    'a <style> block without lang',
    PAGE,
    `${SFC('')}\n<style>p { color: red }</style>`,
    BLOCK,
    "The 'lang' attribute of '<style>' is missing",
  ],
  [
    'a <style lang="css"> block',
    PAGE,
    `${SFC('')}
<style lang="css" src="./x.css"></style>`,
    BLOCK,
    "can be used for the 'lang' attribute of '<style>'",
  ],
  ['a static style attribute', PAGE, SFC('', '<p style="color: red" />'), INLINE, ''],
  [
    'a type alias in models/<entity>/interface.ts',
    'src/models/post/interface.ts',
    'export type Post = { id: number }',
    TYPE_DEFINITION,
    'Use an `interface` instead of a `type`',
  ],
  [
    'an interface in models/<entity>/type.ts',
    'src/models/post/type.ts',
    'export interface Post { id: number }',
    TYPE_DEFINITION,
    'Use a `type` instead of an `interface`',
  ],
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
    "import '@/layout/app-theme-toggle/app-theme-toggle.vue'; import '@/store/theme.store'; import '@/shared/utils/time'; import '@/models/nav/interface'; import '@/core/config/env'; import '@/core/guards/auth.guard'",
  ],
  ['app → a page module *.routes.ts', 'src/app/x.ts', "import '@/pages/post/post.routes'"],
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
  [
    'layout → shared component',
    'src/layout/x.ts',
    "import '@/shared/components/base-button/base-button.vue'",
  ],
  [
    'page → store, shared, models, core/config, core/providers, core/guards',
    PAGE,
    "import '@/store/post.store'; import '@/shared/utils/time'; import '@/models/post/interface'; import '@/core/config/constants'; import '@/core/providers/logger'; import '@/core/guards/unsaved-changes.guard'",
  ],
  ['page → its own component', PAGE, "import '../post-badge/post-badge.vue'"],
  ['page → its own form', PAGE, "import '../post.form'"],
  ['page → generated types by an alias model', PAGE, "import '@/models/post/interface'"],
  [
    'component → shared, models',
    COMPONENT,
    "import '@/shared/components/base-button/base-button.vue'; import '@/models/post/interface'",
  ],
  [
    'routes → core/guards and its own pages',
    ROUTES,
    "import '@/core/guards/auth.guard'; import('./post-page/post-page.vue')",
  ],
  [
    'form → shared/validators, models, generated zod',
    FORM,
    `${ZOD}; import '@/shared/validators/zod-form'; import '@/models/post/interface'`,
  ],
  [
    'store → store, services, models, core/providers, core/config',
    'src/store/x.ts',
    "import '@/store/loading.store'; import '@/services/post.service'; import '@/models/post/interface'; import '@/core/providers/logger'; import '@/core/config/env'",
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
    `${SDK}; import '@/models/post/interface'; import '@/core/config/constants'`,
  ],
  [
    'services → generated barrel',
    'src/services/x.ts',
    "import { getApiHealth } from '@/services/generated'",
  ],
  [
    'core/guards → store, services, core, shared, models',
    'src/core/guards/x.ts',
    "import '@/store/post.store'; import '@/services/post.service'; import '@/core/providers/session'; import '@/shared/utils/time'; import '@/models/nav/interface'",
  ],
  [
    'core/initializers → store, core, models',
    'src/core/initializers/x.ts',
    "import '@/store/theme.store'; import '@/core/providers/session'; import '@/models/nav/interface'",
  ],
  [
    'error.interceptor → store, models, core',
    ERROR_INTERCEPTOR,
    "import '@/store/theme.store'; import '@/models/api/type'; import '@/core/providers/logger'",
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
    "import '@/store/loading.store'; import '@/core/config/env'; import '@/core/providers/logger'; import '@/models/api/type'",
  ],
  [
    'auth wrapper → core/config, core/providers, models',
    AUTH_WRAPPER,
    "import '@/core/config/constants'; import '@/core/providers/session'; import '@/models/api/type'",
  ],
  [
    'auth wrapper calls the global fetch',
    AUTH_WRAPPER,
    "await fetch('/api/auth/refresh'); await globalThis.fetch('/api/auth/refresh')",
  ],
  [
    'core/config → core/providers, core/i18n, core/errors, shared, models',
    'src/core/config/x.ts',
    "import '@/core/providers/logger'; import '@/core/i18n/i18n'; import '@/core/errors/global-error-handler'; import '@/shared/utils/time'; import '@/models/api/type'",
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
    "import '@/pages/post/post.routes'; import '@/app/nav'; import '@/store/theme.store'; import '@/services/post.service'",
  ],
  [
    'page-local .ts → store, shared, models',
    'src/pages/post/use-x.ts',
    "import '@/store/post.store'; import '@/shared/utils/time'; import '@/models/post/interface'",
  ],
  [
    'a spec → testing and any layer',
    'src/pages/post/x.spec.ts',
    "import '@/testing/render'; import '@/services/post.service'",
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
    SFC("import BaseButton from '@/shared/components/base-button/base-button.vue'", '<BaseButton />'),
  ],
  [
    'an empty <style lang="scss" src> block',
    PAGE,
    `${SFC('')}
<style lang="scss" src="./x.scss"></style>`,
  ],
  ['a script-only page', PAGE, SFC('const a = 1\nexport {}\nvoid a')],
  ['files in a claimed directory', 'src/shared/utils/x.ts', 'export {}'],
  ['an interface in models/<entity>/interface.ts', 'src/models/post/interface.ts', 'export interface Post { id: number }'],
  ['a type alias in models/<entity>/type.ts', 'src/models/post/type.ts', 'export type Post = { id: number }'],
]

// The first lint loads the whole config (type-aware presets, plugins), which can take seconds.
describe('lint rules', { timeout: 60_000 }, () => {
  // The allowed cases pass vacuously if the rule stopped firing, so pin one known violation.
  it('still reports exactly one boundaries message for shared → page module', async () => {
    const found = await messagesFor(
      'src/shared/components/x.ts',
      "import '@/pages/post/post.routes'",
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
  it.each([
    'src/lib/format.ts',
    'src/utils/format.ts',
    'src/stray.ts',
    'src/hooks/use-thing.ts',
    'src/components/x.vue',
    'src/features/x/y.vue',
  ])('%s is refused', async (file) => {
    expect(await messagesFor(file, 'export {}', 'boundaries/no-unknown-files')).toHaveLength(1)
  })

  it.each([
    'src/main.ts',
    'src/vite-env.d.ts',
    'src/shared/utils/x.ts',
    'src/models/x.ts',
    'src/layout/app-x/app-x.vue',
    'src/pages/post/x-page/x-page.vue',
  ])('%s is allowed', async (file) => {
    expect(await messagesFor(file, 'export {}', 'boundaries/no-unknown-files')).toEqual([])
  })
})
