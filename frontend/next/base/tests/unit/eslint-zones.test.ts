// @vitest-environment node
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

// Lints one snippet per import zone through the real eslint.config.mjs. The snippets are virtual
// files, which type-aware linting cannot read, so the only override turns the type-aware rules
// off; no-restricted-imports is the real config's, untouched.
const cwd = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({
  cwd,
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    { languageOptions: { parserOptions: { projectService: false } } },
  ],
})

async function restrictions(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${cwd}/${filePath}` })
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === 'no-restricted-imports')
    .map((m) => m.message)
}

const FEATURE_OR_APP = 'shared/ and lib/ never import feature/ or app/'
const APP = 'a feature never imports app/'
const CROSS_UI = "a feature never imports another feature's ui/"
const CLIENT = 'only feature/*/server/ calls the API client'

const violations: [zone: string, file: string, code: string, message: string][] = [
  ['shared → feature', 'src/shared/lib/x.ts', "import '@/feature/health/model'", FEATURE_OR_APP],
  [
    'shared → feature (relative)',
    'src/shared/lib/x.ts',
    "import '../../feature/health/model'",
    FEATURE_OR_APP,
  ],
  ['shared → app', 'src/shared/ui/x.tsx', "import '@/app/page'", FEATURE_OR_APP],
  ['shared → client', 'src/shared/ui/x.tsx', "import '@/lib/api/client'", CLIENT],
  ['lib → feature', 'src/lib/x.ts', "import '@/feature/health/model'", FEATURE_OR_APP],
  ['lib → app', 'src/lib/x.ts', "import '@/app/page'", FEATURE_OR_APP],
  ['lib/api → feature', 'src/lib/api/x.ts', "import '@/feature/health/model'", FEATURE_OR_APP],
  ['feature ui → app', 'src/feature/health/ui/x.tsx', "import '@/app/page'", APP],
  ['feature model → app', 'src/feature/health/model.ts', "import '@/app/page'", APP],
  ['feature server → app', 'src/feature/health/server/x.ts', "import '@/app/page'", APP],
  [
    'feature ui → other ui',
    'src/feature/health/ui/x.tsx',
    "import '@/feature/other/ui/w'",
    CROSS_UI,
  ],
  [
    'feature ui → other ui (relative)',
    'src/feature/health/ui/x.tsx',
    "import '../../other/ui/w'",
    CROSS_UI,
  ],
  [
    'feature server → other ui',
    'src/feature/health/server/x.ts',
    "import '@/feature/other/ui/w'",
    CROSS_UI,
  ],
  ['feature ui → client', 'src/feature/health/ui/x.tsx', "import '@/lib/api/client'", CLIENT],
  ['feature model → client', 'src/feature/health/model.ts', "import '@/lib/api/client'", CLIENT],
  ['app → client', 'src/app/x.tsx', "import '@/lib/api/client'", CLIENT],
  ['src root → client', 'src/x.ts', "import '@/lib/api/client'", CLIENT],
]

const allowed: [what: string, file: string, code: string][] = [
  ['server → client', 'src/feature/health/server/x.ts', "import '@/lib/api/client'"],
  ['server → own ui', 'src/feature/health/server/x.ts', "import '../ui/health-status'"],
  ['app → feature ui', 'src/app/x.tsx', "import '@/feature/health/ui/health-status'"],
  ['feature ui → shared', 'src/feature/health/ui/x.tsx', "import '@/shared/ui/status-pill'"],
  ['feature ui → other model', 'src/feature/health/ui/x.tsx', "import '@/feature/other/model'"],
  ['lib/api → client', 'src/lib/api/x.ts', "import './client'"],
]

describe('import zones', () => {
  it.each(violations)('%s is refused', async (_zone, file, code, message) => {
    const found = await restrictions(file, `${code}\n`)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain(message)
  })

  it.each(allowed)('%s is allowed', async (_what, file, code) => {
    expect(await restrictions(file, `${code}\n`)).toEqual([])
  })
})
