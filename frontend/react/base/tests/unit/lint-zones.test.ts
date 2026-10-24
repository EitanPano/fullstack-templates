// @vitest-environment node
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

// Lints one seeded snippet per zone of eslint.config.mjs with the real config. ESLint does not
// merge the options of a rule across config blocks, so a zone that overlaps another silently
// switches the other's patterns off; only a seeded violation shows that. The override only
// turns off type-aware parsing (the seeded paths are not files on disk); it does not touch
// the two rules under test.
const eslint = new ESLint({ overrideConfig: [tseslint.configs.disableTypeChecked] })

const IMPORTS = 'no-restricted-imports'
const SYNTAX = 'no-restricted-syntax'

type Seed = { zone: string; file: string; code: string; rule: string; message: string }

const seeds: Seed[] = [
  {
    zone: 'lib/api imports a feature',
    file: 'src/lib/api/seed.ts',
    code: "import { loadHealth } from '@/feature/health/api/health'\nexport { loadHealth }\n",
    rule: IMPORTS,
    message: 'lib/ never imports feature/ or app/',
  },
  {
    zone: 'lib/api imports app',
    file: 'src/lib/api/seed.ts',
    code: "import RootLayout from '../../app/layout'\nexport { RootLayout }\n",
    rule: IMPORTS,
    message: 'lib/ never imports feature/ or app/',
  },
  {
    zone: 'lib imports a feature',
    file: 'src/lib/seed.ts',
    code: "import type { HealthView } from '@/feature/health/model'\nexport type Seed = HealthView\n",
    rule: IMPORTS,
    message: 'shared/ and lib/ never import feature/ or app/, nor the API client',
  },
  {
    zone: 'lib imports the client',
    file: 'src/lib/seed.ts',
    code: "import { client } from './api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'nor the API client',
  },
  {
    zone: 'shared imports a feature (relative)',
    file: 'src/shared/lib/seed.ts',
    code: "import type { HealthView } from '../../feature/health/model'\nexport type Seed = HealthView\n",
    rule: IMPORTS,
    message: 'shared/ and lib/ never import feature/ or app/, nor the API client',
  },
  {
    zone: 'shared imports app',
    file: 'src/shared/ui/seed.tsx',
    code: "import NotFound from '@/app/not-found'\nexport { NotFound }\n",
    rule: IMPORTS,
    message: 'shared/ and lib/ never import feature/ or app/, nor the API client',
  },
  {
    zone: 'shared imports the client',
    file: 'src/shared/lib/seed.ts',
    code: "import { client } from '@/lib/api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'nor the API client',
  },
  {
    zone: 'feature api imports app',
    file: 'src/feature/health/api/seed.ts',
    code: "import RootLayout from '@/app/layout'\nexport { RootLayout }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature api imports another feature's ui (alias)",
    file: 'src/feature/health/api/seed.ts',
    code: "import { Widget } from '@/feature/other/ui/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature ui imports another feature's ui (relative)",
    file: 'src/feature/health/ui/seed.tsx',
    code: "import { Widget } from '../../other/ui/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature ui imports another feature's ui (alias)",
    file: 'src/feature/health/ui/seed.tsx',
    code: "import { Widget } from '@/feature/other/ui/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature ui imports another feature's nested ui (alias)",
    file: 'src/feature/health/ui/seed.tsx',
    code: "import { Widget } from '@/feature/other/ui/sub/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature ui in a subfolder imports another feature's ui (relative)",
    file: 'src/feature/health/ui/sub/seed.tsx',
    code: "import { Widget } from '../../../other/ui/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature ui two folders deep imports another feature's nested ui (relative)",
    file: 'src/feature/health/ui/sub/deep/seed.tsx',
    code: "import { Widget } from '../../../../other/ui/sub/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: "feature api imports another feature's nested ui (relative)",
    file: 'src/feature/health/api/seed.ts',
    code: "import { Widget } from '../../other/ui/sub/widget'\nexport { Widget }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: 'feature ui imports app',
    file: 'src/feature/health/ui/seed.tsx',
    code: "import NotFound from '@/app/not-found'\nexport { NotFound }\n",
    rule: IMPORTS,
    message: "a feature never imports app/ or another feature's ui/",
  },
  {
    zone: 'feature ui imports the client',
    file: 'src/feature/health/ui/seed.tsx',
    code: "import { client } from '@/lib/api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'only feature/*/api/ calls the API client',
  },
  {
    zone: 'feature model imports the client (relative)',
    file: 'src/feature/health/model.ts',
    code: "import { client } from '../../lib/api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'only feature/*/api/ calls the API client',
  },
  {
    zone: 'app imports the client',
    file: 'src/app/seed.tsx',
    code: "import { client } from '@/lib/api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'only feature/*/api/ calls the API client',
  },
  {
    zone: 'main imports the client',
    file: 'src/main.tsx',
    code: "import { client } from '@/lib/api/client'\nexport { client }\n",
    rule: IMPORTS,
    message: 'only feature/*/api/ calls the API client',
  },
  // A suffixed spelling of the client path is the same import: the tsconfig allows it.
  ...['.ts', '.js', '.tsx'].flatMap((ext): Seed[] => {
    const message = 'only feature/*/api/ calls the API client'
    const code = (from: string) => `import { client } from '${from}'
export { client }
`
    return [
      { zone: `feature ui imports client${ext} (alias)`, file: 'src/feature/health/ui/seed.tsx', code: code(`@/lib/api/client${ext}`), rule: IMPORTS, message },
      { zone: `feature ui imports client${ext} (relative)`, file: 'src/feature/health/ui/seed.tsx', code: code(`../../../lib/api/client${ext}`), rule: IMPORTS, message },
      { zone: `app imports client${ext}`, file: 'src/app/seed.tsx', code: code(`@/lib/api/client${ext}`), rule: IMPORTS, message },
      { zone: `main imports client${ext}`, file: 'src/main.tsx', code: code(`@/lib/api/client${ext}`), rule: IMPORTS, message },
      { zone: `shared imports client${ext}`, file: 'src/shared/lib/seed.ts', code: code(`@/lib/api/client${ext}`), rule: IMPORTS, message: 'nor the API client' },
      { zone: `lib imports client${ext} (relative)`, file: 'src/lib/seed.ts', code: code(`./api/client${ext}`), rule: IMPORTS, message: 'nor the API client' },
    ]
  }),
  {
    zone: 'import.meta outside env.ts (lib)',
    file: 'src/lib/seed.ts',
    code: 'export const mode = import.meta.env.MODE\n',
    rule: SYNTAX,
    message: 'Read configuration through src/env.ts',
  },
  {
    zone: 'import.meta outside env.ts (feature api)',
    file: 'src/feature/health/api/seed.ts',
    code: 'export const mode = import.meta.env.MODE\n',
    rule: SYNTAX,
    message: 'Read configuration through src/env.ts',
  },
]

// What each layer may do: the zones must not be tighter than the architecture.
const allowed: { what: string; file: string; code: string }[] = [
  {
    what: 'a feature api file calls the client',
    file: 'src/feature/health/api/seed.ts',
    code: "import { client } from '@/lib/api/client'\nexport { client }\n",
  },
  {
    what: 'a feature ui imports its own feature model',
    file: 'src/feature/health/ui/seed.tsx',
    code: "import type { HealthView } from '../model'\nexport type Seed = HealthView\n",
  },
  {
    what: 'a nested feature ui file imports its own feature model',
    file: 'src/feature/health/ui/sub/seed.tsx',
    code: "import type { HealthView } from '../../model'\nexport type Seed = HealthView\n",
  },
  {
    what: 'app imports a feature and shared',
    file: 'src/app/seed.tsx',
    code: "import { StatusPill } from '@/shared/ui/status-pill'\nimport { loadHealth } from '@/feature/health/api/health'\nexport { StatusPill, loadHealth }\n",
  },
  {
    what: 'lib/api imports its own schema',
    file: 'src/lib/api/seed.ts',
    code: "import type { paths } from './schema'\nexport type Seed = paths\n",
  },
  {
    what: 'env.ts reads import.meta.env',
    file: 'src/env.ts',
    code: 'export const mode = import.meta.env.MODE\n',
  },
]

async function lint(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: file })
  const zoneRules = new Set([IMPORTS, SYNTAX])
  return (result?.messages ?? []).filter((m) => m.ruleId !== null && zoneRules.has(m.ruleId))
}

describe('eslint zones', () => {
  it.each(seeds)('flags $zone', async ({ file, code, rule, message }) => {
    const messages = await lint(file, code)

    expect(messages.map((m) => m.ruleId)).toContain(rule)
    expect(messages.find((m) => m.ruleId === rule)?.message).toContain(message)
  })

  it.each(allowed)('allows $what', async ({ file, code }) => {
    expect(await lint(file, code)).toEqual([])
  })
})
