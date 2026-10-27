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
// by the file it resolves to; the slices are invented here, so adding a real one never breaks the
// test. Type-aware linting cannot read virtual files, so the one override turns it off.
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.app.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'boundaries-'))

const FILES = [
  'src/app/nav.ts',
  'src/widget/system-status/ui/system-status.tsx',
  'src/widget/other/ui/y.tsx',
  'src/feature/refresh-health/model.ts',
  'src/feature/refresh-health/ui/refresh-health-button.tsx',
  'src/feature/refresh-health/api/refresh-health.ts',
  'src/feature/other/ui/y.tsx',
  'src/entity/health/model.ts',
  'src/entity/health/ui/health-badge.tsx',
  'src/entity/health/api/health.ts',
  'src/entity/other/model.ts',
  'src/entity/other/ui/y.tsx',
  'src/shared/api/client.ts',
  'src/shared/api/call.ts',
  'src/shared/api/index.ts',
  'src/shared/api/generated/sdk.gen.ts',
  'src/shared/api/generated/zod.gen.ts',
  'src/shared/auth/session.ts',
  'src/shared/auth/next-path.ts',
  'src/shared/config/env.ts',
  'src/shared/lib/cn.ts',
  'src/shared/ui/badge.tsx',
  'src/shared/ui/button.tsx',
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
  const [result] = await eslint.lintText(
    `${code}
`,
    { filePath: join(root, filePath) },
  )
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message)
}

const BOUNDARY = 'boundaries/dependencies'
const SYNTAX = 'no-restricted-syntax'

type Violation = [rule: string, file: string, code: string, ruleId: string, message: string]

const violations: Violation[] = [
  // Layer direction: each message names the layer to use instead.
  [
    'feature → widget',
    'src/feature/refresh-health/ui/x.tsx',
    "import '@/widget/system-status/ui/system-status'",
    BOUNDARY,
    'compose widgets in a widget or in app/',
  ],
  [
    'entity → feature',
    'src/entity/health/ui/x.tsx',
    "import '@/feature/refresh-health/ui/refresh-health-button'",
    BOUNDARY,
    'compose features in a widget',
  ],
  [
    'entity → widget',
    'src/entity/health/ui/x.tsx',
    "import '@/widget/system-status/ui/system-status'",
    BOUNDARY,
    'compose widgets in a widget or in app/',
  ],
  [
    'shared → entity',
    'src/shared/ui/x.tsx',
    "import '@/entity/health/model'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → feature',
    'src/shared/lib/x.ts',
    "import '@/feature/refresh-health/model'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → app',
    'src/shared/ui/x.tsx',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  [
    'widget → app',
    'src/widget/system-status/ui/x.tsx',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  [
    'feature → app',
    'src/feature/refresh-health/ui/x.tsx',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  // A sibling slice in the same layer: lift to shared/ or compose one layer up.
  [
    'widget → sibling widget',
    'src/widget/system-status/ui/x.tsx',
    "import '@/widget/other/ui/y'",
    BOUNDARY,
    'a widget never imports another widget',
  ],
  [
    'feature → sibling feature',
    'src/feature/refresh-health/ui/x.tsx',
    "import '@/feature/other/ui/y'",
    BOUNDARY,
    'a feature never imports another feature',
  ],
  [
    'entity → sibling entity (value)',
    'src/entity/health/ui/x.tsx',
    "import '@/entity/other/model'",
    BOUNDARY,
    'import type from its model.ts',
  ],
  [
    'entity → sibling entity (type, not model.ts)',
    'src/entity/health/ui/x.tsx',
    "import type {} from '@/entity/other/ui/y'",
    BOUNDARY,
    'import type from its model.ts',
  ],
  // The API client's home is shared/api; only */api/* and shared/auth import it.
  [
    'ui → shared/api',
    'src/entity/health/ui/x.tsx',
    "import '@/shared/api/client'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'app → shared/api',
    'src/app/x.tsx',
    "import '@/shared/api/client'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'shared/lib → shared/api',
    'src/shared/lib/x.ts',
    "import '@/shared/api/client'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  // A model.ts may import the contract's types, and the generated zod schemas to extend; nothing
  // else of shared/api, and no other file of a slice.
  [
    'entity model.ts → shared/api client (value)',
    'src/entity/health/model.ts',
    "import '@/shared/api/client'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'feature model.ts → generated sdk (value)',
    'src/feature/refresh-health/model.ts',
    "import '@/shared/api/generated/sdk.gen'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'feature model.ts → shared/api (value import of the types barrel)',
    'src/feature/refresh-health/model.ts',
    "import { x } from '@/shared/api'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'entity ui → shared/api (type)',
    'src/entity/health/ui/x.tsx',
    "import type {} from '@/shared/api'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  [
    'feature ui → generated zod (value)',
    'src/feature/refresh-health/ui/x.tsx',
    "import '@/shared/api/generated/zod.gen'",
    BOUNDARY,
    'only */api/* and shared/auth import shared/api',
  ],
  // A Client Component imports from server/ only an action.ts.
  // Raw controls outside shared/ui.
  [
    '<button> outside shared/ui',
    'src/feature/refresh-health/ui/x.tsx',
    'export const x = <button />',
    SYNTAX,
    'Button from @/shared/ui/button',
  ],
  [
    '<input> outside shared/ui',
    'src/feature/refresh-health/ui/x.tsx',
    'export const x = <input />',
    SYNTAX,
    'Input from @/shared/ui/input',
  ],
  [
    '<select> outside shared/ui',
    'src/widget/system-status/ui/x.tsx',
    'export const x = <select />',
    SYNTAX,
    'Select from @/shared/ui/select',
  ],
  [
    '<textarea> outside shared/ui',
    'src/app/x.tsx',
    'export const x = <textarea />',
    SYNTAX,
    'Textarea from @/shared/ui/textarea',
  ],
  // revalidatePath and a bare fetch( belong to shared/api.
  [
    'bare fetch outside shared/api',
    'src/entity/health/api/x.ts',
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through shared/api',
  ],
  [
    'globalThis.fetch outside shared/api',
    'src/entity/health/api/x.ts',
    "await globalThis.fetch('/api/health')",
    SYNTAX,
    'call the API through shared/api',
  ],
  [
    'widget → sibling widget (relative path)',
    'src/widget/system-status/ui/x.tsx',
    "import '../../other/ui/y'",
    BOUNDARY,
    'a widget never imports another widget',
  ],
  [
    'bare fetch in shared/ui',
    'src/shared/ui/x.tsx',
    "await fetch('/api/health')",
    SYNTAX,
    'call the API through shared/api',
  ],
  // The one reader of import.meta.env.
  [
    'import.meta.env outside shared/config/env.ts',
    'src/shared/lib/x.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
    'src/shared/config/env.ts',
  ],
  [
    'import.meta.env in shared/api',
    'src/shared/api/x.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
    'src/shared/config/env.ts',
  ],
]

const allowed: [what: string, file: string, code: string, ruleId: string][] = [
  ['app → widget', 'src/app/x.tsx', "import '@/widget/system-status/ui/system-status'", BOUNDARY],
  ['app → entity', 'src/app/x.tsx', "import '@/entity/health/model'", BOUNDARY],
  ['app → shared', 'src/app/x.tsx', "import '@/shared/ui/button'", BOUNDARY],
  [
    'widget → feature',
    'src/widget/system-status/ui/x.tsx',
    "import '@/feature/refresh-health/ui/refresh-health-button'",
    BOUNDARY,
  ],
  [
    'widget → entity',
    'src/widget/system-status/ui/x.tsx',
    "import '@/entity/health/ui/health-badge'",
    BOUNDARY,
  ],
  [
    'feature → entity',
    'src/feature/refresh-health/api/x.ts',
    "import '@/entity/health/api/health'",
    BOUNDARY,
  ],
  [
    'feature → shared',
    'src/feature/refresh-health/ui/x.tsx',
    "import '@/shared/ui/button'",
    BOUNDARY,
  ],
  ['entity → shared', 'src/entity/health/ui/x.tsx', "import '@/shared/ui/badge'", BOUNDARY],
  ['shared → shared', 'src/shared/ui/x.tsx', "import '@/shared/lib/cn'", BOUNDARY],
  ['own slice (relative)', 'src/entity/health/ui/x.tsx', "import '../api/health'", BOUNDARY],
  [
    'entity → other entity, import type from model.ts',
    'src/entity/health/ui/x.tsx',
    "import type {} from '@/entity/other/model'",
    BOUNDARY,
  ],
  ['*/api/* → shared/api', 'src/entity/health/api/x.ts', "import '@/shared/api/client'", BOUNDARY],
  ['shared/auth → shared/api', 'src/shared/auth/x.ts', "import '@/shared/api/client'", BOUNDARY],
  ['shared/api → shared/config', 'src/shared/api/x.ts', "import '@/shared/config/env'", BOUNDARY],
  [
    'entity model.ts → shared/api (import type)',
    'src/entity/health/model.ts',
    "import type {} from '@/shared/api'",
    BOUNDARY,
  ],
  [
    'feature model.ts → generated zod schemas (value)',
    'src/feature/refresh-health/model.ts',
    "import '@/shared/api/generated/zod.gen'",
    BOUNDARY,
  ],
  ['shared/lib → shared/auth', 'src/shared/lib/x.ts', "import '@/shared/auth/session'", BOUNDARY],
  [
    'entity */api/* → shared/auth',
    'src/entity/health/api/x.ts',
    "import '@/shared/auth/session'",
    BOUNDARY,
  ],
  ['<button> in shared/ui', 'src/shared/ui/x.tsx', 'export const x = <button />', SYNTAX],
  ['<input> in shared/ui', 'src/shared/ui/x.tsx', 'export const x = <input />', SYNTAX],
  [
    'a component used as <Button>',
    'src/feature/refresh-health/ui/x.tsx',
    'export const x = <Button />',
    SYNTAX,
  ],
  ['fetch in shared/api', 'src/shared/api/x.ts', "await fetch('/api/health')", SYNTAX],
  [
    'globalThis.fetch in shared/api',
    'src/shared/api/x.ts',
    "await globalThis.fetch('/api/health')",
    SYNTAX,
  ],
  [
    'import.meta.env in shared/config/env.ts',
    'src/shared/config/env.ts',
    'export const v = import.meta.env.MODE',
    SYNTAX,
  ],
]

// The first lint loads the whole config (type-aware presets, plugins), which can take seconds.
describe('lint rules', { timeout: 60_000 }, () => {
  it.each(violations)('%s is refused', async (_rule, file, code, ruleId, message) => {
    const found = await messagesFor(file, code, ruleId)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain(message)
  })

  it.each(allowed)('%s is allowed', async (_what, file, code, ruleId) => {
    expect(await messagesFor(file, code, ruleId)).toEqual([])
  })
})
