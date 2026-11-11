// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, describe, expect, it } from 'vitest'

// Lints one snippet per rule through the real eslint.config.mjs. The snippets run in a throwaway
// project that holds the files they import, because the boundary rule classifies a dependency by
// the file it resolves to (an import that resolves to nothing is never reported); the page modules are
// invented here, so adding a real one never breaks the test. Type-aware linting cannot read
// virtual files, so the one override turns it off.
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.json', import.meta.url)))
const tsconfigApp = readFileSync(fileURLToPath(new URL('../../tsconfig.app.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'boundaries-'))

const FILES = [
  'src/app/app.config.ts',
  'src/app/app.routes.ts',
  'src/app/nav.ts',
  'src/app/layout/app-main-layout/app-main-layout.component.ts',
  'src/app/pages/post/post.routes.ts',
  'src/app/pages/post/post.form.ts',
  'src/app/pages/post/post-list/post-list.component.ts',
  'src/app/pages/post/post-list/post-badge/post-badge.component.ts',
  'src/app/pages/other/other.routes.ts',
  'src/app/pages/other/other.form.ts',
  'src/app/pages/other/other-page/other-page.component.ts',
  'src/app/pages/other/other-page/other-card/other-card.component.ts',
  'src/app/store/post.store.ts',
  'src/app/services/post.service.ts',
  'src/app/services/generated/sdk.gen.ts',
  'src/app/services/generated/types.gen.ts',
  'src/app/services/generated/client.gen.ts',
  'src/app/services/generated/client/client.gen.ts',
  'src/app/services/generated/zod.gen.ts',
  'src/app/core/guards/auth.guard.ts',
  'src/app/core/interceptors/auth.interceptor.ts',
  'src/app/core/initializers/session.initializer.ts',
  'src/app/core/config/constants.ts',
  'src/app/core/providers/storage.service.ts',
  'src/app/core/i18n/language.service.ts',
  'src/app/core/errors/global-error-handler.ts',
  'src/app/shared/components/button/button.component.ts',
  'src/app/shared/utils/time.ts',
  'src/app/shared/validators/zod-validator.ts',
  'src/app/models/post/interface.ts',
]
for (const file of FILES) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), 'export {}\n')
}
writeFileSync(join(root, 'tsconfig.json'), tsconfig)
writeFileSync(join(root, 'tsconfig.app.json'), tsconfigApp)

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: config,
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    {
      languageOptions: { parserOptions: { projectService: false } },
      settings: {
        'boundaries/root-path': root,
        // The alias resolver reads the tsconfig of the project it is given; point it at the
        // throwaway one, not the working directory's. The config's own key, so this replaces it
        // instead of adding a second resolver that would still resolve to the real project.
        'import/resolver': {
          typescript: { alwaysTryTypes: true, project: join(root, 'tsconfig.app.json') },
        },
      },
    },
  ],
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function messagesFor(filePath: string, code: string, ruleId: string) {
  const [result] = await eslint.lintText(`${code}\n`, { filePath: join(root, filePath) })
  return result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.message)
}

const BOUNDARY = 'boundaries/dependencies'
const RESTRICTED = 'no-restricted-imports'

const PAGE = 'src/app/pages/post/post-list/x.ts'
const COMPONENT = 'src/app/pages/post/post-list/post-badge/x.ts'
const ROUTES = 'src/app/pages/post/x.routes.ts'
const FORM = 'src/app/pages/post/x.form.ts'
const CROSS = 'a page module never imports another page module'
const GENERATED = 'the generated client is imported only by services/'

type Violation = [rule: string, file: string, code: string, ruleId: string, message: string]

const violations: Violation[] = [
  // app/ wires the layers; a page is reached through its module routes only, services through a store.
  [
    'app → services',
    'src/app/app.config.ts',
    "import '@app/services/post.service'",
    BOUNDARY,
    'app/ wires layout/',
  ],
  [
    'app → page',
    'src/app/app.routes.ts',
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'import a page only through its module *.routes.ts',
  ],
  [
    'layout → services',
    'src/app/layout/app-main-layout/x.ts',
    "import '@app/services/post.service'",
    BOUNDARY,
    'layout/ imports core/',
  ],
  [
    'layout → page',
    'src/app/layout/app-main-layout/x.ts',
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'layout/ imports core/',
  ],
  // Pages inject stores, never services; a page module never reaches into another page module.
  [
    'page → services',
    PAGE,
    "import '@app/services/post.service'",
    BOUNDARY,
    'call services through a store method',
  ],
  [
    'page → core/guards',
    PAGE,
    "import '@app/core/guards/auth.guard'",
    BOUNDARY,
    'a page imports store/',
  ],
  [
    'page → other module component',
    PAGE,
    "import '@app/pages/other/other-page/other-card/other-card.component'",
    BOUNDARY,
    CROSS,
  ],
  ['page → other module form', PAGE, "import '@app/pages/other/other.form'", BOUNDARY, CROSS],
  [
    'component → store',
    COMPONENT,
    "import '@app/store/post.store'",
    BOUNDARY,
    'a page component is presentational',
  ],
  [
    'component → its own page',
    COMPONENT,
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'a page component is presentational',
  ],
  [
    'routes → other module page',
    ROUTES,
    "import '@app/pages/other/other-page/other-page.component'",
    BOUNDARY,
    CROSS,
  ],
  [
    'routes → store',
    ROUTES,
    "import '@app/store/post.store'",
    BOUNDARY,
    'a module routes file imports core/guards and its own pages only',
  ],
  [
    'routes → its own module form',
    ROUTES,
    "import '@app/pages/post/post.form'",
    BOUNDARY,
    'a module routes file imports core/guards and its own pages only',
  ],
  [
    'routes → its own module component',
    ROUTES,
    "import '@app/pages/post/post-list/post-badge/post-badge.component'",
    BOUNDARY,
    'a module routes file imports core/guards and its own pages only',
  ],
  [
    'form → its own page',
    FORM,
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'a *.form.ts imports shared/validators',
  ],
  [
    'form → shared component',
    FORM,
    "import '@app/shared/components/button/button.component'",
    BOUNDARY,
    'a *.form.ts imports shared/validators',
  ],
  ['form → generated sdk', FORM, "import '@app/services/generated/sdk.gen'", BOUNDARY, GENERATED],
  [
    'store → shared component',
    'src/app/store/x.ts',
    "import '@app/shared/components/button/button.component'",
    BOUNDARY,
    'a store imports services/',
  ],
  [
    'store → page',
    'src/app/store/x.ts',
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'a store imports services/',
  ],
  [
    'services → store',
    'src/app/services/x.ts',
    "import '@app/store/post.store'",
    BOUNDARY,
    'a service imports models/',
  ],
  [
    'services → core/providers',
    'src/app/services/x.ts',
    "import '@app/core/providers/storage.service'",
    BOUNDARY,
    'a service imports models/',
  ],
  [
    'core/guards → page',
    'src/app/core/guards/x.ts',
    "import '@app/pages/post/post-list/post-list.component'",
    BOUNDARY,
    'core wiring',
  ],
  [
    'core/interceptors → app',
    'src/app/core/interceptors/x.ts',
    "import '@app/app.config'",
    BOUNDARY,
    'core wiring',
  ],
  [
    'core/config → app',
    'src/app/core/config/x.ts',
    "import '@app/app.config'",
    BOUNDARY,
    'core/config, providers, i18n and errors import each other',
  ],
  [
    'core/providers → store',
    'src/app/core/providers/x.ts',
    "import '@app/store/post.store'",
    BOUNDARY,
    'core/config, providers, i18n and errors import each other',
  ],
  [
    'core/i18n → services',
    'src/app/core/i18n/x.ts',
    "import '@app/services/post.service'",
    BOUNDARY,
    'core/config, providers, i18n and errors import each other',
  ],
  [
    'core/errors → core/guards',
    'src/app/core/errors/x.ts',
    "import '@app/core/guards/auth.guard'",
    BOUNDARY,
    'core/config, providers, i18n and errors import each other',
  ],
  [
    'shared → core',
    'src/app/shared/utils/x.ts',
    "import '@app/core/config/constants'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → store',
    'src/app/shared/components/button/x.ts',
    "import '@app/store/post.store'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → page module',
    'src/app/shared/validators/x.ts',
    "import '@app/pages/post/post.routes'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'models → store',
    'src/app/models/post/x.ts',
    "import '@app/store/post.store'",
    BOUNDARY,
    'models/ holds types and constants',
  ],
  // The generated client's runtime belongs to services/; models/ may import its types only.
  [
    'models → generated (value)',
    'src/app/models/post/x.ts',
    "import { x } from '@app/services/generated/types.gen'",
    BOUNDARY,
    GENERATED,
  ],
  // Ruling R20: only core/config/api-client.provider.ts, which provides the client, may import
  // its runtime.
  [
    'core/config (not api-client.provider.ts) → generated client',
    'src/app/core/config/x.ts',
    "import { client } from '@app/services/generated/client.gen'",
    BOUNDARY,
    GENERATED,
  ],
  ['page → generated sdk', PAGE, "import '@app/services/generated/sdk.gen'", BOUNDARY, GENERATED],
  [
    'store → generated sdk',
    'src/app/store/x.ts',
    "import '@app/services/generated/sdk.gen'",
    BOUNDARY,
    GENERATED,
  ],
  // HttpClient belongs to services/, core/interceptors/ and core/config/, and (ruling R22) to the
  // one loader in core/i18n.
  [
    '@angular/common/http in core/i18n/ (not the loader)',
    'src/app/core/i18n/language.service.ts',
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
    'HttpClient is imported only in services/',
  ],
  [
    '@angular/common/http in shared/',
    'src/app/shared/utils/x.ts',
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
    'HttpClient is imported only in services/',
  ],
  [
    '@angular/common/http in a store',
    'src/app/store/x.ts',
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
    'HttpClient is imported only in services/',
  ],
  [
    '@angular/common/http in a page',
    PAGE,
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
    'HttpClient is imported only in services/',
  ],
]

// A folder no layer claims is refused, so the old homes cannot come back unnoticed.
const unknown: [what: string, file: string][] = [
  ['src/app/components/', 'src/app/components/x.ts'],
  ['src/app/features/<module>/', 'src/app/features/post/x.ts'],
  ['a component outside layout/, shared/ and pages/', 'src/app/widgets/x.ts'],
]

const allowed: [what: string, file: string, code: string, ruleId: string][] = [
  ['app → core/config', 'src/app/app.config.ts', "import '@app/core/config/constants'", BOUNDARY],
  ['app → app', 'src/app/app.config.ts', "import './app.routes'", BOUNDARY],
  [
    'app → layout',
    'src/app/app.routes.ts',
    "import '@app/layout/app-main-layout/app-main-layout.component'",
    BOUNDARY,
  ],
  [
    'app → module routes (the lazy import)',
    'src/app/app.routes.ts',
    "import('@app/pages/post/post.routes')",
    BOUNDARY,
  ],
  ['app → store', 'src/app/app.config.ts', "import '@app/store/post.store'", BOUNDARY],
  [
    'layout → core/providers',
    'src/app/layout/app-main-layout/x.ts',
    "import '@app/core/providers/storage.service'",
    BOUNDARY,
  ],
  ['page → store', PAGE, "import '@app/store/post.store'", BOUNDARY],
  ['page → shared', PAGE, "import '@app/shared/components/button/button.component'", BOUNDARY],
  ['page → models', PAGE, "import '@app/models/post/interface'", BOUNDARY],
  ['page → core/config', PAGE, "import '@app/core/config/constants'", BOUNDARY],
  ['page → core/providers', PAGE, "import '@app/core/providers/storage.service'", BOUNDARY],
  ['page → its own component folder', PAGE, "import './post-badge/post-badge.component'", BOUNDARY],
  ['page → its own module form', PAGE, "import '@app/pages/post/post.form'", BOUNDARY],
  [
    'component → shared',
    COMPONENT,
    "import '@app/shared/components/button/button.component'",
    BOUNDARY,
  ],
  ['component → models', COMPONENT, "import '@app/models/post/interface'", BOUNDARY],
  ['routes → core/guards', ROUTES, "import '@app/core/guards/auth.guard'", BOUNDARY],
  [
    'routes → its own pages (the lazy import)',
    ROUTES,
    "import('./post-list/post-list.component')",
    BOUNDARY,
  ],
  ['form → shared/validators', FORM, "import '@app/shared/validators/zod-validator'", BOUNDARY],
  ['form → models', FORM, "import '@app/models/post/interface'", BOUNDARY],
  ['form → generated zod schemas', FORM, "import '@app/services/generated/zod.gen'", BOUNDARY],
  ['store → services', 'src/app/store/x.ts', "import '@app/services/post.service'", BOUNDARY],
  ['store → models', 'src/app/store/x.ts', "import '@app/models/post/interface'", BOUNDARY],
  [
    'store → core/providers',
    'src/app/store/x.ts',
    "import '@app/core/providers/storage.service'",
    BOUNDARY,
  ],
  ['store → core/config', 'src/app/store/x.ts', "import '@app/core/config/constants'", BOUNDARY],
  [
    'services → generated sdk',
    'src/app/services/x.ts',
    "import '@app/services/generated/sdk.gen'",
    BOUNDARY,
  ],
  [
    'services → core/config',
    'src/app/services/x.ts',
    "import '@app/core/config/constants'",
    BOUNDARY,
  ],
  ['services → models', 'src/app/services/x.ts', "import '@app/models/post/interface'", BOUNDARY],
  ['core/guards → store', 'src/app/core/guards/x.ts', "import '@app/store/post.store'", BOUNDARY],
  [
    'core/interceptors → services',
    'src/app/core/interceptors/x.ts',
    "import '@app/services/post.service'",
    BOUNDARY,
  ],
  [
    'core/initializers → store',
    'src/app/core/initializers/x.ts',
    "import '@app/store/post.store'",
    BOUNDARY,
  ],
  [
    'core/initializers → core/providers',
    'src/app/core/initializers/x.ts',
    "import '@app/core/providers/storage.service'",
    BOUNDARY,
  ],
  ['core/config → shared', 'src/app/core/config/x.ts', "import '@app/shared/utils/time'", BOUNDARY],
  [
    'core/providers → core/config',
    'src/app/core/providers/x.ts',
    "import '@app/core/config/constants'",
    BOUNDARY,
  ],
  [
    'core/i18n → core/providers',
    'src/app/core/i18n/x.ts',
    "import '@app/core/providers/storage.service'",
    BOUNDARY,
  ],
  [
    'core/errors → models',
    'src/app/core/errors/x.ts',
    "import '@app/models/post/interface'",
    BOUNDARY,
  ],
  ['shared → shared', 'src/app/shared/utils/x.ts', "import '@app/shared/utils/time'", BOUNDARY],
  [
    'shared → shared/validators',
    'src/app/shared/components/button/x.ts',
    "import '@app/shared/validators/zod-validator'",
    BOUNDARY,
  ],
  ['shared → models', 'src/app/shared/utils/x.ts', "import '@app/models/post/interface'", BOUNDARY],
  [
    'models → generated types (import type)',
    'src/app/models/post/x.ts',
    "import type { x } from '@app/services/generated/types.gen'",
    BOUNDARY,
  ],
  [
    'core/config/api-client.provider.ts → generated client (the one allowance)',
    'src/app/core/config/api-client.provider.ts',
    "import { client } from '@app/services/generated/client.gen'",
    BOUNDARY,
  ],
  [
    'core/config/api-client.provider.ts → generated provider',
    'src/app/core/config/api-client.provider.ts',
    "import { provideHeyApiClient } from '@app/services/generated/client/client.gen'",
    BOUNDARY,
  ],
  [
    'core/config → generated types (import type)',
    'src/app/core/config/x.ts',
    "import type { x } from '@app/services/generated/client.gen'",
    BOUNDARY,
  ],
  [
    '@angular/common/http in services/',
    'src/app/services/x.ts',
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
  ],
  [
    '@angular/common/http in core/interceptors/',
    'src/app/core/interceptors/x.ts',
    "import { HttpHandlerFn } from '@angular/common/http'",
    RESTRICTED,
  ],
  // @i18n-start
  [
    '@angular/common/http in the core/i18n loader (ruling R22)',
    'src/app/core/i18n/transloco-http.loader.ts',
    "import { HttpClient } from '@angular/common/http'",
    RESTRICTED,
  ],
  // @i18n-end
  [
    '@angular/common/http in core/config/',
    'src/app/core/config/x.ts',
    "import { HttpContextToken } from '@angular/common/http'",
    RESTRICTED,
  ],
]

// The first lint loads the whole config (type-aware presets, plugins), which can take seconds.
describe('lint rules', { timeout: 60_000 }, () => {
  it.each(violations)('%s is refused', async (_rule, file, code, ruleId, message) => {
    const found = await messagesFor(file, code, ruleId)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain(message)
  })

  it.each(unknown)('a file in %s is refused as unknown', async (_what, file) => {
    const found = await messagesFor(file, 'export {}', 'boundaries/no-unknown-files')
    expect(found).toHaveLength(1)
  })

  it.each(allowed)('%s is allowed', async (_what, file, code, ruleId) => {
    expect(await messagesFor(file, code, ruleId)).toEqual([])
  })
})
