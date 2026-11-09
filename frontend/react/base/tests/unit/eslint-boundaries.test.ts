// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, describe, expect, it } from 'vitest'

// Lints one snippet per rule through the real eslint.config.mjs. The snippets run in a throwaway
// project that holds the files they import, because the boundary rule classifies a dependency
// by the file it resolves to; the pages are invented here, so adding a real one never breaks
// the test. Type-aware linting cannot read virtual files, so the one override turns it off.
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.app.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'boundaries-'))

const FILES = [
  'src/main.tsx',
  'src/app/nav.ts',
  'src/app/providers.tsx',
  'src/app/routes.tsx',
  'src/components/app-main-error.tsx',
  'src/store/hooks.ts',
  'src/store/listeners.ts',
  'src/services/call.ts',
  'src/shared/utils/storage.ts',
  'src/shared/components/toaster.tsx',
  'src/core/config/env.ts',
  'src/components/app-main-components.tsx',
  'src/pages/health/health.routes.tsx',
  'src/pages/health/home-page.tsx',
  'src/pages/health/components/system-status.tsx',
  'src/pages/other/other.routes.tsx',
  'src/pages/other/y.tsx',
  'src/store/index.ts',
  'src/store/theme.slice.ts',
  'src/services/api.ts',
  'src/services/health.api.ts',
  'src/services/auth.api.ts',
  'src/services/user.api.ts',
  'src/services/generated/types.gen.ts',
  'src/services/generated/sdk.gen.ts',
  'src/services/generated/zod.gen.ts',
  'src/core/config/env.ts',
  'src/core/config/api-client.ts',
  'src/core/config/constants.ts',
  'src/core/auth/guards.ts',
  'src/core/auth/session-hint.ts',
  'src/core/theme/theme.ts',
  'src/shared/utils/cn.ts',
  'src/shared/components/button.tsx',
  'src/models/health.ts',
  'src/models/api-error.ts',
  'src/models/user.ts',
  'src/testing/render-routes.tsx',
]
for (const file of FILES) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), 'export {}\n')
}
writeFileSync(join(root, 'tsconfig.app.json'), tsconfig)

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
        // throwaway one, not the working directory's.
        'import/resolver': {
          // The config's own key, so this replaces it instead of adding a second resolver that
          // would still resolve to the real project.
          typescript: {
            alwaysTryTypes: true,
            project: join(root, 'tsconfig.app.json'),
          },
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
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message)
}

const BOUNDARY = 'boundaries/dependencies'
const SYNTAX = 'no-restricted-syntax'
const IMPORTS = 'no-restricted-imports'

const PAGE_FILE = 'src/pages/health/x.tsx'
const SDK = "import { getApiHealth } from '@/services/generated/sdk.gen'"
const ZOD = "import { zHealthResponse } from '@/services/generated/zod.gen'"
const TYPES = "import type { HealthResponse } from '@/services/generated/types.gen'"

type Violation = [rule: string, file: string, code: string, ruleId: string, message: string]

const violations: Violation[] = [
  // app/ reads a page through its routes file only.
  [
    'app → page page',
    'src/app/x.tsx',
    "import '@/pages/health/home-page'",
    BOUNDARY,
    'app/ imports a page only through its *.routes.tsx',
  ],
  [
    'app → services',
    'src/app/x.tsx',
    "import '@/services/health.api'",
    BOUNDARY,
    'read data through a hook in a page',
  ],
  // components/ composes no screen.
  [
    'components → page',
    'src/components/x.tsx',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'compose pages in app/routes.tsx',
  ],
  [
    'components → app',
    'src/components/x.tsx',
    "import '@/app/nav'",
    BOUNDARY,
    'components/ never imports app/',
  ],
  // A page stays inside itself.
  [
    'page → other page',
    PAGE_FILE,
    "import '@/pages/other/y'",
    BOUNDARY,
    'a page never imports another page',
  ],
  [
    'page → other page (relative path)',
    PAGE_FILE,
    "import '../other/y'",
    BOUNDARY,
    'a page never imports another page',
  ],
  ['page → app', PAGE_FILE, "import '@/app/nav'", BOUNDARY, 'a page never imports app/'],
  [
    'page → components',
    PAGE_FILE,
    "import '@/components/app-main-components'",
    BOUNDARY,
    'a page never imports app/, components/',
  ],
  [
    'page form → services',
    'src/pages/health/health.form.ts',
    "import '@/services/health.api'",
    BOUNDARY,
    'a *.form.ts imports shared/, models/ and the generated zod schemas only',
  ],
  [
    'page → testing',
    PAGE_FILE,
    "import '@/testing/render-routes'",
    BOUNDARY,
    'only a *.test.ts(x) imports testing/',
  ],
  // store/ knows services and the theme leaves.
  [
    'store → page',
    'src/store/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'store/ imports services/',
  ],
  [
    'store → shared',
    'src/store/x.ts',
    "import '@/shared/utils/cn'",
    BOUNDARY,
    'it never knows pages, components or shared/',
  ],
  [
    'store → core/auth',
    'src/store/x.ts',
    "import '@/core/auth/session-hint'",
    BOUNDARY,
    'the auth wiring (core/auth) sits above the store',
  ],
  // services/ is the data layer.
  [
    'services → page',
    'src/services/x.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'it never knows the store, shared/ or any screen',
  ],
  [
    'services → store',
    'src/services/x.ts',
    "import '@/store/index'",
    BOUNDARY,
    'it never knows the store, shared/ or any screen',
  ],
  [
    'services → core/theme',
    'src/services/x.ts',
    "import '@/core/theme/theme'",
    BOUNDARY,
    'services/ imports core/config and core/auth only',
  ],
  // core/: the leaves are leaves; only the guards wire.
  [
    'core/config → store',
    'src/core/config/x.ts',
    "import '@/store/index'",
    BOUNDARY,
    'core/auth/guards.ts is the one file that reaches store/ and services/',
  ],
  [
    'core/theme → services',
    'src/core/theme/x.ts',
    "import '@/services/api'",
    BOUNDARY,
    'core/auth/guards.ts is the one file that reaches store/ and services/',
  ],
  [
    'core/config → generated (value)',
    'src/core/config/x.ts',
    SDK,
    BOUNDARY,
    'core/auth/guards.ts is the one file that reaches store/ and services/',
  ],
  [
    'core/auth/guards → page',
    'src/core/auth/guards.ts',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'core/auth/guards.ts is the one file that reaches store/ and services/',
  ],
  // shared/ is product-agnostic.
  [
    'shared → core',
    'src/shared/utils/x.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → core/auth',
    'src/shared/components/x.tsx',
    "import '@/core/auth/session-hint'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'models → core',
    'src/models/x.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
    'models/ imports models/ and the generated contract types',
  ],
  // The guards are the wiring above services and the leaves.
  [
    'services → guards',
    'src/services/x.ts',
    "import '@/core/auth/guards'",
    BOUNDARY,
    'guards are the wiring above services and the leaves',
  ],
  [
    'core/config → guards',
    'src/core/config/x.ts',
    "import '@/core/auth/guards'",
    BOUNDARY,
    'guards are the wiring above services and the leaves',
  ],
  [
    'core/auth/session-hint → guards',
    'src/core/auth/session-hint.ts',
    "import '@/core/auth/guards'",
    IMPORTS,
    'guards are the wiring above services and the leaves',
  ],
  [
    'core/theme → guards',
    'src/core/theme/x.ts',
    "import '@/core/auth/guards'",
    BOUNDARY,
    'guards are the wiring above services and the leaves',
  ],
  [
    'shared → services',
    'src/shared/components/x.tsx',
    "import '@/services/health.api'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → store',
    'src/shared/components/x.tsx',
    "import '@/store/index'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → page',
    'src/shared/components/x.tsx',
    "import '@/pages/health/health.routes'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  // models/ holds the contract's types and pure helpers.
  ['models → generated (value)', 'src/models/x.ts', SDK, BOUNDARY, 'import type'],
  [
    'models → shared',
    'src/models/x.ts',
    "import '@/shared/utils/cn'",
    BOUNDARY,
    'models/ imports models/ and the generated contract types',
  ],
  // The generated runtime belongs to services/.
  [
    'generated value import in a page',
    PAGE_FILE,
    SDK,
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  [
    'generated value import in a page (relative path)',
    PAGE_FILE,
    "import { getApiHealth } from '../../services/generated/sdk.gen'",
    IMPORTS,
    'add an endpoint in services/<module>.api.ts',
  ],
  [
    'generated sdk in a page form',
    'src/pages/health/health.form.ts',
    SDK,
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  [
    'generated value import in the components',
    'src/components/x.tsx',
    "import { client } from '@/services/generated/client.gen'",
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  // The generated files: runtime in services/ only; types through models/.
  [
    'generated barrel in a page form',
    'src/pages/health/health.form.ts',
    "import '@/services/generated'",
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  [
    'generated sdk in a page form (relative path)',
    'src/pages/health/health.form.ts',
    "import { getApiHealth } from '../../services/generated/sdk.gen'",
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  [
    'generated barrel in a page (relative bare directory)',
    PAGE_FILE,
    "import '../../services/generated'",
    IMPORTS,
    'only services/ imports the generated runtime',
  ],
  [
    'a type import of the generated types in a page',
    PAGE_FILE,
    TYPES,
    BOUNDARY,
    "read the contract's types through models/<noun>.ts",
  ],
  [
    'generated types in app',
    'src/app/x.tsx',
    TYPES,
    BOUNDARY,
    "read the contract's types through models/",
  ],
  [
    'generated types in the components',
    'src/components/x.tsx',
    TYPES,
    BOUNDARY,
    "read the contract's types through models/",
  ],
  [
    'shared → generated (type)',
    'src/shared/components/x.tsx',
    TYPES,
    BOUNDARY,
    "read the contract's types through models/",
  ],
  ['store → generated (value)', 'src/store/x.ts', SDK, BOUNDARY, 'store/ imports services/'],
  [
    'app → testing',
    'src/app/x.tsx',
    "import '@/testing/render-routes'",
    BOUNDARY,
    'only a *.test.ts(x) imports testing/',
  ],
  [
    'components → testing',
    'src/components/x.tsx',
    "import '@/testing/render-routes'",
    BOUNDARY,
    'only a *.test.ts(x) imports testing/',
  ],
  [
    'services → shared',
    'src/services/x.ts',
    "import '@/shared/utils/cn'",
    BOUNDARY,
    'it never knows the store, shared/ or any screen',
  ],
  [
    'page form → core',
    'src/pages/health/health.form.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
    'a *.form.ts imports shared/, models/',
  ],
  [
    'page form → store',
    'src/pages/health/health.form.ts',
    "import '@/store/index'",
    BOUNDARY,
    'a *.form.ts imports shared/, models/',
  ],
  [
    'main.tsx → testing',
    'src/main.tsx',
    "import '@/testing/render-routes'",
    BOUNDARY,
    'main.tsx imports app/, store/, core/ and shared/ only',
  ],
  [
    'main.tsx → services',
    'src/main.tsx',
    "import '@/services/health.api'",
    BOUNDARY,
    'main.tsx imports app/, store/, core/ and shared/ only',
  ],
  [
    'window.fetch in a page',
    PAGE_FILE,
    "await window.fetch('/api/health')",
    SYNTAX,
    'call the API through a services/<module>.api.ts endpoint',
  ],
  // Raw controls outside shared/components.
  [
    '<button> outside shared/components',
    PAGE_FILE,
    'export const x = <button />',
    SYNTAX,
    'Button from @/shared/components/button',
  ],
  [
    '<input> outside shared/components',
    'src/components/x.tsx',
    'export const x = <input />',
    SYNTAX,
    'Input from @/shared/components/input',
  ],
  [
    '<select> outside shared/components',
    PAGE_FILE,
    'export const x = <select />',
    SYNTAX,
    'Select from @/shared/components/select',
  ],
  [
    '<textarea> outside shared/components',
    'src/app/x.tsx',
    'export const x = <textarea />',
    SYNTAX,
    'Textarea from @/shared/components/textarea',
  ],
  // fetch( belongs to the generated client's runtime config.
  [
    'bare fetch outside api-client',
    'src/services/x.ts',
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through a services/<module>.api.ts endpoint',
  ],
  [
    'globalThis.fetch outside api-client',
    'src/core/auth/x.ts',
    "await globalThis.fetch('/api/health')",
    SYNTAX,
    'call the API through a services/<module>.api.ts endpoint',
  ],
  [
    'bare fetch in shared/components',
    'src/shared/components/x.tsx',
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through a services/<module>.api.ts endpoint',
  ],
  // The one reader of import.meta.env.
  [
    'import.meta.env outside core/config/env.ts',
    'src/shared/utils/x.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
    'src/core/config/env.ts',
  ],
  [
    'import.meta.env in api-client',
    'src/core/config/api-client.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
    'src/core/config/env.ts',
  ],
  // CSS lives in the styles tree.
  [
    'style attribute in a page',
    PAGE_FILE,
    'export const x = <p style={{ color: "red" }} />',
    SYNTAX,
    "add a class to the component's stylesheet",
  ],
  [
    'style attribute in shared/components',
    'src/shared/components/x.tsx',
    'export const x = <p style={{ color: "red" }} />',
    SYNTAX,
    'never an inline style',
  ],
  [
    'style attribute in the components',
    'src/components/x.tsx',
    'export const x = <p style={{ color: "red" }} />',
    SYNTAX,
    'never an inline style',
  ],
]

const allowed: [what: string, file: string, code: string, ruleId: string][] = [
  ['app → page routes', 'src/app/x.tsx', "import '@/pages/health/health.routes'", BOUNDARY],
  ['app → components', 'src/app/x.tsx', "import '@/components/app-main-components'", BOUNDARY],
  ['app → core guards', 'src/app/x.tsx', "import '@/core/auth/guards'", BOUNDARY],
  ['app → store', 'src/app/x.tsx', "import '@/store/index'", BOUNDARY],
  ['app → shared', 'src/app/x.tsx', "import '@/shared/utils/cn'", BOUNDARY],
  ['app → models', 'src/app/x.tsx', "import '@/models/health'", BOUNDARY],
  [
    'components → services (the hooks)',
    'src/components/x.tsx',
    "import '@/services/health.api'",
    BOUNDARY,
  ],
  ['components → store', 'src/components/x.tsx', "import '@/store/index'", BOUNDARY],
  ['components → core', 'src/components/x.tsx', "import '@/core/theme/theme'", BOUNDARY],
  ['page → own page', PAGE_FILE, "import '@/pages/health/components/system-status'", BOUNDARY],
  ['page → own page (relative path)', PAGE_FILE, "import './components/system-status'", BOUNDARY],
  ['page → services (the hooks)', PAGE_FILE, "import '@/services/health.api'", BOUNDARY],
  ['page → store', PAGE_FILE, "import '@/store/index'", BOUNDARY],
  [
    'page → core guards',
    'src/pages/health/health.routes.tsx',
    "import '@/core/auth/guards'",
    BOUNDARY,
  ],
  ['page → shared', PAGE_FILE, "import '@/shared/components/button'", BOUNDARY],
  ['page → models', PAGE_FILE, "import '@/models/health'", BOUNDARY],
  ['page form → shared', 'src/pages/health/health.form.ts', "import '@/shared/utils/cn'", BOUNDARY],
  ['page form → generated zod schemas', 'src/pages/health/health.form.ts', ZOD, BOUNDARY],
  [
    'page form → generated zod schemas (no restricted import)',
    'src/pages/health/health.form.ts',
    ZOD,
    IMPORTS,
  ],
  ['store → services', 'src/store/x.ts', "import '@/services/api'", BOUNDARY],
  ['store → core/theme', 'src/store/x.ts', "import '@/core/theme/theme'", BOUNDARY],
  ['store → core/config', 'src/store/x.ts', "import '@/core/config/constants'", BOUNDARY],
  ['store → models', 'src/store/x.ts', "import '@/models/api-error'", BOUNDARY],
  ['services → generated', 'src/services/x.ts', SDK, BOUNDARY],
  ['services → generated (no restricted import)', 'src/services/x.ts', SDK, IMPORTS],
  ['services → core/config', 'src/services/x.ts', "import '@/core/config/constants'", BOUNDARY],
  ['services → core/auth', 'src/services/x.ts', "import '@/core/auth/session-hint'", BOUNDARY],
  ['services → models', 'src/services/x.ts', "import '@/models/api-error'", BOUNDARY],
  ['core/auth/guards → store', 'src/core/auth/guards.ts', "import '@/store/index'", BOUNDARY],
  [
    'core/auth/guards → services',
    'src/core/auth/guards.ts',
    "import '@/services/health.api'",
    BOUNDARY,
  ],
  [
    'core/auth/guards → core/config',
    'src/core/auth/guards.ts',
    "import '@/core/config/constants'",
    BOUNDARY,
  ],
  [
    'core/auth/guards → services (user.api)',
    'src/core/auth/guards.ts',
    "import '@/services/user.api'",
    BOUNDARY,
  ],
  [
    'page → core/auth',
    'src/pages/health/health.routes.tsx',
    "import '@/core/auth/session-hint'",
    BOUNDARY,
  ],
  [
    'components → services (account hooks)',
    'src/components/x.tsx',
    "import '@/services/user.api'",
    BOUNDARY,
  ],
  [
    'services → core/auth (user.api → session-hint)',
    'src/services/auth.api.ts',
    "import '@/core/auth/session-hint'",
    BOUNDARY,
  ],
  ['core/auth/guards → models', 'src/core/auth/guards.ts', "import '@/models/health'", BOUNDARY],
  ['core/config → shared', 'src/core/config/x.ts', "import '@/shared/utils/cn'", BOUNDARY],
  ['core/config → models', 'src/core/config/x.ts', "import '@/models/health'", BOUNDARY],
  [
    'core/config → core/auth/session-hint',
    'src/core/config/x.ts',
    "import '@/core/auth/session-hint'",
    BOUNDARY,
  ],
  ['core/theme → core/config', 'src/core/theme/x.ts', "import '@/core/config/constants'", BOUNDARY],
  ['api-client → generated (import type)', 'src/core/config/api-client.ts', TYPES, BOUNDARY],
  [
    'api-client → generated (import type, no restricted import)',
    'src/core/config/api-client.ts',
    TYPES,
    IMPORTS,
  ],
  ['shared → shared', 'src/shared/components/x.tsx', "import '@/shared/utils/cn'", BOUNDARY],
  ['shared → models', 'src/shared/components/x.tsx', "import '@/models/health'", BOUNDARY],
  ['models → generated (import type)', 'src/models/x.ts', TYPES, BOUNDARY],
  ['store → generated (import type)', 'src/store/x.ts', TYPES, BOUNDARY],
  ['core/config → generated (import type)', 'src/core/config/x.ts', TYPES, BOUNDARY],
  [
    'main.tsx → app, store, core, shared',
    'src/main.tsx',
    "import '@/app/providers'; import '@/store/index'; import '@/core/theme/theme'; import '@/shared/utils/zod-messages'",
    BOUNDARY,
  ],
  ['models → models', 'src/models/x.ts', "import '@/models/api-error'", BOUNDARY],
  ['testing → page', 'src/testing/x.tsx', "import '@/pages/health/health.routes'", BOUNDARY],
  ['testing → app', 'src/testing/x.tsx', "import '@/app/nav'", BOUNDARY],
  ['testing → store', 'src/testing/x.tsx', "import '@/store/index'", BOUNDARY],
  [
    'a test file → testing',
    'src/pages/health/x.test.tsx',
    "import '@/testing/render-routes'",
    BOUNDARY,
  ],
  [
    '<button> in shared/components',
    'src/shared/components/x.tsx',
    'export const x = <button />',
    SYNTAX,
  ],
  [
    '<input> in shared/components',
    'src/shared/components/x.tsx',
    'export const x = <input />',
    SYNTAX,
  ],
  ['a component used as <Button>', PAGE_FILE, 'export const x = <Button />', SYNTAX],
  ['fetch in api-client', 'src/core/config/api-client.ts', "await fetch('/api/health')", SYNTAX],
  [
    'globalThis.fetch in api-client',
    'src/core/config/api-client.ts',
    "await globalThis.fetch('/api/health')",
    SYNTAX,
  ],
  [
    'import.meta.env in core/config/env.ts',
    'src/core/config/env.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
  ],
  ['a className in a page', PAGE_FILE, 'export const x = <p className="a" />', SYNTAX],
]

const UNKNOWN_FILES = 'boundaries/no-unknown-files'

describe('files outside every layer', { timeout: 60_000 }, () => {
  it.each([
    'src/hooks/use-thing.ts',
    'src/layout/x.tsx',
    'src/features/health/x.tsx',
    'src/lib/format.ts',
    'src/utils/format.ts',
    'src/stray.ts',
  ])('%s is refused', async (file) => {
    expect(await messagesFor(file, 'export {}', UNKNOWN_FILES)).toHaveLength(1)
  })

  it.each([
    'src/main.tsx',
    'src/vite-env.d.ts',
    'src/shared/utils/x.ts',
    'src/models/x.ts',
    'src/components/app-x.tsx',
    'src/pages/health/x.tsx',
  ])('%s is allowed', async (file) => {
    expect(await messagesFor(file, 'export {}', UNKNOWN_FILES)).toEqual([])
  })
})

// The first lint loads the whole config (type-aware presets, plugins), which can take seconds.
describe('lint rules', { timeout: 60_000 }, () => {
  // The allowed cases pass vacuously if the rule stopped firing, so pin one known violation.
  it('still reports exactly one boundaries message for shared → page', async () => {
    const found = await messagesFor(
      'src/shared/components/x.tsx',
      "import '@/pages/health/health.routes'",
      BOUNDARY,
    )
    expect(found).toHaveLength(1)
  })

  it.each(violations)('%s is refused', async (_rule, file, code, ruleId, message) => {
    const found = await messagesFor(file, code, ruleId)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain(message)
  })

  it.each(allowed)('%s is allowed', async (_what, file, code, ruleId) => {
    expect(await messagesFor(file, code, ruleId)).toEqual([])
  })
})
