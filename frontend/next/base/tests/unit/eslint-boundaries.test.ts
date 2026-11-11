// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, describe, expect, it } from 'vitest'

// Lints one snippet per rule through the real eslint.config.mjs. The snippets run in a throwaway
// project that holds the files they import, because the boundary rule classifies a dependency
// by the file it resolves to; the routes and nouns are invented here, so adding a real one never
// breaks the test. Type-aware linting cannot read virtual files, so the one override turns it off.
const require = createRequire(import.meta.url)
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'boundaries-'))

const FILES = [
  'src/app/nav.ts',
  'src/app/(site)/post/page.tsx',
  'src/app/(site)/post/_components/post-list.tsx',
  'src/app/(site)/other/page.tsx',
  'src/app/(site)/post/comment/page.tsx',
  'src/app/(site)/post/comment/reply/page.tsx',
  'src/components/app-badge.tsx',
  'src/actions/post.ts',
  'src/services/post.ts',
  'src/services/client.ts',
  'src/services/generated/sdk.gen.ts',
  'src/services/generated/types.gen.ts',
  'src/services/generated/zod.gen.ts',
  'src/store/theme.ts',
  'src/core/auth/session.ts',
  'src/core/config/env.ts',
  'src/shared/utils/cn.ts',
  'src/shared/components/button.tsx',
  'src/models/post.ts',
]
for (const file of FILES) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), 'export {}\n')
}
writeFileSync(join(root, 'tsconfig.json'), tsconfig)

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
          [require.resolve('eslint-import-resolver-typescript')]: {
            alwaysTryTypes: true,
            project: join(root, 'tsconfig.json'),
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
const UNKNOWN = 'boundaries/no-unknown-files'
const SYNTAX = 'no-restricted-syntax'
const CLIENT = 'local/client-server-import'
const ROUTE = 'local/route-components'
const STYLESHEET = 'no-restricted-imports'

type Violation = [rule: string, file: string, code: string, ruleId: string, message: string]

const violations: Violation[] = [
  // Layer direction: each message names the layer to use instead.
  [
    'components → app',
    'src/components/x.tsx',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  [
    'actions → app',
    'src/actions/x.ts',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  [
    'services → app',
    'src/services/x.ts',
    "import '@/app/nav'",
    BOUNDARY,
    'only app/ is allowed to import app/',
  ],
  [
    'shared → app',
    'src/shared/utils/x.ts',
    "import '@/app/nav'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'actions → components',
    'src/actions/x.ts',
    "import '@/components/app-badge'",
    BOUNDARY,
    'actions/ imports services/, core/, shared/ and models/ only',
  ],
  [
    'actions → store',
    'src/actions/x.ts',
    "import '@/store/theme'",
    BOUNDARY,
    'actions/ imports services/, core/, shared/ and models/ only',
  ],
  [
    'services → components',
    'src/services/x.ts',
    "import '@/components/app-badge'",
    BOUNDARY,
    'services/ imports services/, core/ and models/ only',
  ],
  [
    'services → actions',
    'src/services/x.ts',
    "import '@/actions/post'",
    BOUNDARY,
    'services/ imports services/, core/ and models/ only',
  ],
  [
    'services → store',
    'src/services/x.ts',
    "import '@/store/theme'",
    BOUNDARY,
    'services/ imports services/, core/ and models/ only',
  ],
  [
    'services → shared',
    'src/services/x.ts',
    "import '@/shared/utils/cn'",
    BOUNDARY,
    'services/ imports services/, core/ and models/ only',
  ],
  [
    'store → components',
    'src/store/x.ts',
    "import '@/components/app-badge'",
    BOUNDARY,
    'store/ imports core/, shared/ and models/ only',
  ],
  [
    'store → actions',
    'src/store/x.ts',
    "import '@/actions/post'",
    BOUNDARY,
    'store/ imports core/, shared/ and models/ only',
  ],
  [
    'store → services',
    'src/store/x.ts',
    "import '@/services/post'",
    BOUNDARY,
    'store/ imports core/, shared/ and models/ only',
  ],
  [
    'core → components',
    'src/core/x.ts',
    "import '@/components/app-badge'",
    BOUNDARY,
    'core/ imports services/, shared/, models/ and core/ only',
  ],
  [
    'core → actions',
    'src/core/x.ts',
    "import '@/actions/post'",
    BOUNDARY,
    'core/ imports services/, shared/, models/ and core/ only',
  ],
  [
    'core → store',
    'src/core/x.ts',
    "import '@/store/theme'",
    BOUNDARY,
    'core/ imports services/, shared/, models/ and core/ only',
  ],
  [
    'shared → components',
    'src/shared/utils/x.ts',
    "import '@/components/app-badge'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → services',
    'src/shared/utils/x.ts',
    "import '@/services/post'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'shared → core',
    'src/shared/components/x.tsx',
    "import '@/core/config/env'",
    BOUNDARY,
    'shared/ is product-agnostic',
  ],
  [
    'models → services (value)',
    'src/models/x.ts',
    "import '@/services/post'",
    BOUNDARY,
    'models/ imports models/ and the generated contract',
  ],
  [
    'models → core',
    'src/models/x.ts',
    "import '@/core/config/env'",
    BOUNDARY,
    'models/ imports models/ and the generated contract',
  ],
  [
    'models → shared',
    'src/models/x.ts',
    "import '@/shared/utils/cn'",
    BOUNDARY,
    'models/ imports models/ and the generated contract',
  ],
  // The generated contract: types and zod schemas reach models/; the runtime stays in services/.
  [
    'models → generated sdk (value)',
    'src/models/x.ts',
    "import '@/services/generated/sdk.gen'",
    BOUNDARY,
    'models/ imports models/ and the generated contract',
  ],
  [
    'models → generated types (value)',
    'src/models/x.ts',
    "import { x } from '@/services/generated/types.gen'",
    BOUNDARY,
    'models/ imports models/ and the generated contract',
  ],
  [
    'app → generated (type)',
    'src/app/x.tsx',
    "import type {} from '@/services/generated/types.gen'",
    BOUNDARY,
    "read the contract's types through models/<noun>.ts",
  ],
  [
    'components → generated',
    'src/components/x.tsx',
    "import '@/services/generated/sdk.gen'",
    BOUNDARY,
    "read the contract's types through models/<noun>.ts",
  ],
  [
    'store → generated',
    'src/store/x.ts',
    "import type {} from '@/services/generated/types.gen'",
    BOUNDARY,
    "read the contract's types through models/<noun>.ts",
  ],
  // A file that no layer claims.
  [
    'a file outside every layer (src/lib)',
    'src/lib/x.ts',
    'export const x = 1',
    UNKNOWN,
    'does not belong to any known element',
  ],
  [
    'a file in a retired layer (src/widget)',
    'src/widget/post-list/ui/x.tsx',
    'export const x = 1',
    UNKNOWN,
    'does not belong to any known element',
  ],
  // A Client Component imports no value from services/ or core/auth/.
  [
    "'use client' → services read",
    'src/components/x.tsx',
    "'use client'\nimport '@/services/post'",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  [
    "'use client' → core/auth",
    'src/components/x.tsx',
    "'use client'\nimport '@/core/auth/session'",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  [
    "'use client' → services read (relative path)",
    'src/components/x.tsx',
    "'use client'\nimport '../services/post'",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  [
    "'use client' re-exporting a read (export from)",
    'src/components/x.tsx',
    "'use client'\nexport { getPost } from '@/services/post'",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  [
    "'use client' re-exporting a read (export *)",
    'src/components/x.tsx',
    "'use client'\nexport * from '@/services/post'",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  // A _components/ folder belongs to its route folder.
  [
    '_components/ imported from another route (alias)',
    'src/app/(site)/other/page.tsx',
    "import '@/app/(site)/post/_components/post-list'",
    ROUTE,
    'its route folder and the routes below it',
  ],
  [
    '_components/ imported from another route (relative path)',
    'src/app/(site)/other/page.tsx',
    "import '../post/_components/post-list'",
    ROUTE,
    'its route folder and the routes below it',
  ],
  [
    '_components/ imported from components/',
    'src/components/x.tsx',
    "import '@/app/(site)/post/_components/post-list'",
    ROUTE,
    'a _components/ file belongs to its route folder and the routes below it',
  ],
  [
    '_components/ imported from the parent route',
    'src/app/(site)/page.tsx',
    "import './post/_components/post-list'",
    ROUTE,
    'its route folder and the routes below it',
  ],
  [
    '_components/ dynamically imported from another route',
    'src/app/(site)/other/page.tsx',
    "const x = import('../post/_components/post-list')",
    ROUTE,
    'its route folder and the routes below it',
  ],
  [
    "'use client' → services read (dynamic import)",
    'src/components/x.tsx',
    "'use client'\nconst x = import('@/services/post')",
    CLIENT,
    'a Client Component imports no value from services/ or core/auth/',
  ],
  [
    'the global tree from a route file other than layout and global-error',
    'src/app/not-found.tsx',
    "import '@/styles/styles.scss'",
    STYLESHEET,
    'only src/app/layout.tsx and src/app/global-error.tsx load the global style tree',
  ],
  // Raw controls outside shared/components.
  [
    '<button> outside shared/components',
    'src/components/x.tsx',
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
    'src/app/(site)/post/_components/x.tsx',
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
  // CSS is a class in a stylesheet beside its owner, never an inline style.
  [
    'a style attribute in a component',
    'src/components/x.tsx',
    "export const x = <p style={{ color: 'red' }} />",
    SYNTAX,
    'never an inline style',
  ],
  [
    'a style attribute in a route file',
    'src/app/(site)/post/page.tsx',
    "export const x = <p style={{ color: 'red' }} />",
    SYNTAX,
    'never an inline style',
  ],
  [
    'a style attribute in shared/components',
    'src/shared/components/x.tsx',
    "export const x = <p style={{ color: 'red' }} />",
    SYNTAX,
    'never an inline style',
  ],
  // A stylesheet import is the owner's sibling; only app/layout.tsx loads the global tree.
  [
    'the global tree from a component',
    'src/components/x.tsx',
    "import '@/styles/styles.scss'",
    STYLESHEET,
    'only src/app/layout.tsx and src/app/global-error.tsx load the global style tree',
  ],
  [
    'the brand tokens from a route file',
    'src/app/(site)/post/page.tsx',
    "import '@/styles/themes/brand.css'",
    STYLESHEET,
    'only src/app/layout.tsx and src/app/global-error.tsx load the global style tree',
  ],
  [
    "another folder's sheet by a relative path",
    'src/components/x.tsx',
    "import '../shared/components/button.scss'",
    STYLESHEET,
    "import the component's own sibling sheet",
  ],
  [
    'a sheet through the alias',
    'src/components/x.tsx',
    "import '@/shared/components/button.scss'",
    STYLESHEET,
    "import the component's own sibling sheet",
  ],
  [
    'a plain CSS sibling',
    'src/components/x.tsx',
    "import './x.css'",
    STYLESHEET,
    "import the component's own sibling sheet",
  ],
  // revalidatePath and a bare fetch( belong to services/.
  [
    'revalidatePath outside services',
    'src/actions/x.ts',
    "import { revalidatePath } from 'next/cache'\nrevalidatePath('/')",
    SYNTAX,
    'revalidatePath is reserved to services/',
  ],
  [
    'bare fetch outside services',
    'src/actions/x.ts',
    "await fetch('/api/post')",
    SYNTAX,
    'call the API through services/',
  ],
  [
    'globalThis.fetch outside services',
    'src/core/x.ts',
    "await globalThis.fetch('/api/post')",
    SYNTAX,
    'call the API through services/',
  ],
  [
    'bare fetch in shared/components',
    'src/shared/components/x.tsx',
    "await fetch('/api/post')",
    SYNTAX,
    'call the API through services/',
  ],
  // The one reader of process.env.
  [
    'process.env outside core/config/env.ts',
    'src/shared/utils/x.ts',
    'export const v = process.env.API_URL',
    'no-restricted-properties',
    'src/core/config/env.ts',
  ],
]

const allowed: [what: string, file: string, code: string, ruleId: string][] = [
  ['app → components', 'src/app/x.tsx', "import '@/components/app-badge'", BOUNDARY],
  ['app → services', 'src/app/x.tsx', "import '@/services/post'", BOUNDARY],
  ['app → actions', 'src/app/x.tsx', "import '@/actions/post'", BOUNDARY],
  ['app → store', 'src/app/x.tsx', "import '@/store/theme'", BOUNDARY],
  ['app → core', 'src/app/x.tsx', "import '@/core/auth/session'", BOUNDARY],
  ['app → shared', 'src/app/x.tsx', "import '@/shared/components/button'", BOUNDARY],
  ['app → models', 'src/app/x.tsx', "import '@/models/post'", BOUNDARY],
  ['components → services', 'src/components/x.tsx', "import '@/services/post'", BOUNDARY],
  ['components → actions', 'src/components/x.tsx', "import '@/actions/post'", BOUNDARY],
  ['components → store', 'src/components/x.tsx', "import '@/store/theme'", BOUNDARY],
  ['components → core', 'src/components/x.tsx', "import '@/core/auth/session'", BOUNDARY],
  ['components → shared', 'src/components/x.tsx', "import '@/shared/components/button'", BOUNDARY],
  ['components → models', 'src/components/x.tsx', "import '@/models/post'", BOUNDARY],
  ['actions → services', 'src/actions/x.ts', "import '@/services/post'", BOUNDARY],
  ['actions → core', 'src/actions/x.ts', "import '@/core/auth/session'", BOUNDARY],
  ['actions → shared', 'src/actions/x.ts', "import '@/shared/utils/cn'", BOUNDARY],
  ['actions → models', 'src/actions/x.ts', "import '@/models/post'", BOUNDARY],
  ['actions → generated', 'src/actions/x.ts', "import '@/services/generated/sdk.gen'", BOUNDARY],
  ['services → services', 'src/services/x.ts', "import '@/services/client'", BOUNDARY],
  ['services → core', 'src/services/x.ts', "import '@/core/config/env'", BOUNDARY],
  ['services → models', 'src/services/x.ts', "import '@/models/post'", BOUNDARY],
  ['services → generated', 'src/services/x.ts', "import '@/services/generated/sdk.gen'", BOUNDARY],
  ['store → core', 'src/store/x.ts', "import '@/core/config/env'", BOUNDARY],
  ['store → shared', 'src/store/x.ts', "import '@/shared/utils/cn'", BOUNDARY],
  ['store → models', 'src/store/x.ts', "import '@/models/post'", BOUNDARY],
  ['core → services', 'src/core/x.ts', "import '@/services/client'", BOUNDARY],
  ['core → generated', 'src/core/x.ts', "import '@/services/generated/sdk.gen'", BOUNDARY],
  ['core → shared', 'src/core/x.ts', "import '@/shared/utils/cn'", BOUNDARY],
  ['core → models', 'src/core/x.ts', "import '@/models/post'", BOUNDARY],
  ['core → core', 'src/core/x.ts', "import '@/core/config/env'", BOUNDARY],
  ['shared → shared', 'src/shared/components/x.tsx', "import '@/shared/utils/cn'", BOUNDARY],
  ['shared → models', 'src/shared/components/x.tsx', "import '@/models/post'", BOUNDARY],
  ['models → models', 'src/models/x.ts', "import '@/models/post'", BOUNDARY],
  [
    'models → generated types (import type)',
    'src/models/x.ts',
    "import type {} from '@/services/generated/types.gen'",
    BOUNDARY,
  ],
  [
    'models → generated types (export type from)',
    'src/models/x.ts',
    "export type { PublicUser } from '@/services/generated/types.gen'",
    BOUNDARY,
  ],
  [
    'models → generated zod schemas (value)',
    'src/models/x.ts',
    "import '@/services/generated/zod.gen'",
    BOUNDARY,
  ],
  ['a file in a layer', 'src/shared/utils/x.ts', 'export const x = 1', UNKNOWN],
  ['a file in a route folder', 'src/app/(site)/post/x.tsx', 'export const x = 1', UNKNOWN],
  ['proxy.ts, outside the layers', 'src/proxy.ts', 'export const x = 1', UNKNOWN],
  ['a test beside its source', 'src/lib/x.test.ts', 'export const x = 1', UNKNOWN],
  [
    "'use client' → action",
    'src/components/x.tsx',
    "'use client'\nimport '@/actions/post'",
    CLIENT,
  ],
  [
    "'use client' → action (relative path)",
    'src/components/x.tsx',
    "'use client'\nimport '../actions/post'",
    CLIENT,
  ],
  [
    "'use client' re-exporting an action",
    'src/components/x.tsx',
    "'use client'\nexport { renamePost } from '@/actions/post'",
    CLIENT,
  ],
  [
    "'use client' → type from a read",
    'src/components/x.tsx',
    "'use client'\nimport type {} from '@/services/post'",
    CLIENT,
  ],
  [
    "'use client' → type from core/auth",
    'src/components/x.tsx',
    "'use client'\nimport { type Role } from '@/core/auth/session'",
    CLIENT,
  ],
  [
    "'use client' → core/config",
    'src/components/x.tsx',
    "'use client'\nimport '@/core/config/env'",
    CLIENT,
  ],
  [
    'server component → services read',
    'src/app/(site)/post/_components/x.tsx',
    "import '@/services/post'",
    CLIENT,
  ],
  [
    'a route file → its _components/ (relative path)',
    'src/app/(site)/post/page.tsx',
    "import './_components/post-list'",
    ROUTE,
  ],
  [
    'a route file → its _components/ (alias)',
    'src/app/(site)/post/page.tsx',
    "import '@/app/(site)/post/_components/post-list'",
    ROUTE,
  ],
  [
    'a _components/ file → its sibling',
    'src/app/(site)/post/_components/x.tsx',
    "import './post-list'",
    ROUTE,
  ],
  [
    "a nested folder of _components/ → the route folder's _components/",
    'src/app/(site)/post/_components/deep/x.tsx',
    "import '@/app/(site)/post/_components/post-list'",
    ROUTE,
  ],
  [
    "a child route → its parent route's _components/",
    'src/app/(site)/post/comment/page.tsx',
    "import '../_components/post-list'",
    ROUTE,
  ],
  [
    "a grandchild route → its ancestor route's _components/",
    'src/app/(site)/post/comment/reply/page.tsx',
    "import '@/app/(site)/post/_components/post-list'",
    ROUTE,
  ],
  [
    'the global tree from app/global-error.tsx',
    'src/app/global-error.tsx',
    "import '@fontsource-variable/inter'\nimport '@/styles/themes/brand.css'\nimport '@/styles/styles.scss'",
    STYLESHEET,
  ],
  ['a sibling sheet', 'src/components/x.tsx', "import './x.scss'", STYLESHEET],
  ['a route sheet', 'src/app/(site)/post/page.tsx', "import './page.scss'", STYLESHEET],
  ['a kit sheet', 'src/shared/components/x.tsx', "import './x.scss'", STYLESHEET],
  [
    'the global tree from app/layout.tsx',
    'src/app/layout.tsx',
    "import '@/styles/themes/brand.css'\nimport '@/styles/styles.scss'",
    STYLESHEET,
  ],
  ['a class name', 'src/components/x.tsx', "export const x = <p className='x' />", SYNTAX],
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
  ['a component used as <Button>', 'src/components/x.tsx', 'export const x = <Button />', SYNTAX],
  [
    'revalidatePath in services',
    'src/services/x.ts',
    "import { revalidatePath } from 'next/cache'\nrevalidatePath('/')",
    SYNTAX,
  ],
  ['fetch in services', 'src/services/x.ts', "await fetch('/api/post')", SYNTAX],
  [
    'globalThis.fetch in services',
    'src/services/x.ts',
    "await globalThis.fetch('/api/post')",
    SYNTAX,
  ],
  [
    'process.env in core/config/env.ts',
    'src/core/config/env.ts',
    'export const v = process.env.API_URL',
    'no-restricted-properties',
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
