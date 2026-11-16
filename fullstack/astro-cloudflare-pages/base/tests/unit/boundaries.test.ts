// The import rules of eslint.config.mjs, proved through the real config: one violation and one
// allowed case per rule, each violation's message naming the layer to use instead.
import path from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const eslint = new ESLint({ cwd: root })

const RULES = new Set([
  'import-x/no-restricted-paths',
  'no-restricted-imports',
  'no-restricted-properties',
])

async function boundaryMessages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.has(message.ruleId))
    .map((message) => message.message)
}

const astro = (source: string) => `---\nimport { x } from '${source}'\nvoid x\n---\n<p />\n`
const ts = (source: string) => `import { x } from '${source}'\nvoid x\n`

// [file, code, the words the message must carry]
const refused: [string, string, string][] = [
  ['src/services/x.ts', ts('../../server/infra/db'), 'shared/'],
  ['src/services/x.ts', ts('@server/infra/db'), 'shared/'],
  ['src/services/x.ts', ts('../../functions/api/health/index'), 'shared/'],
  ['src/pages/x.astro', astro('../../server/infra/db'), 'shared/'],
  ['src/pages/x.astro', astro('@server/infra/db'), 'shared/'],
  ['server/middleware/x.ts', ts('../../src/layouts/base-layout.astro'), 'shared/'],
  ['functions/api/x.ts', ts('../../src/layouts/base-layout.astro'), 'shared/'],
  ['server/middleware/x.ts', ts('@src/layouts/base-layout.astro'), 'shared/'],
  ['shared/x.ts', ts('../server/infra/db'), 'leaf'],
  ['shared/x.ts', ts('@server/infra/db'), 'shared/'],
  ['shared/x.ts', ts('../src/layouts/base-layout.astro'), 'leaf'],
  ['server/models/module/x.ts', ts('../../services/logger'), 'models/ is a leaf'],
  ['server/config/x.ts', ts('../services/logger'), 'config/ imports nothing'],
  ['server/services/utils/x.ts', ts('../logger'), 'pure'],
  ['server/services/security/x.ts', ts('../../middleware/handler'), 'never imports middleware'],
  ['server/infra/x.ts', ts('../services/logger'), 'infra/ imports config/ and models/'],
  ['server/middleware/x.ts', ts('../api/module/controller'), 'never imports api/'],
  ['server/middleware/x.ts', ts('../api/module/service'), 'controller.ts'],
  ['server/services/x.ts', ts('../api/module/model'), 'controller.ts'],
  ['functions/api/x.ts', ts('../../server/api/module/service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../../middleware/handler'), 'never sees HTTP'],
  ['functions/api/x.ts', ts('../../server/services/logger'), 'controllers'],
  ['server/api/other/controller.ts', ts('../module/service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../module/controller'), 'data layer'],
  ['server/services/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  ['functions/api/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
]

const allowed: [string, string][] = [
  ['src/services/x.ts', ts('@shared/schemas/module')],
  ['src/services/x.ts', ts('../../shared/schemas/module')],
  ['src/pages/x.astro', astro('@shared/schemas/module')],
  ['server/services/x.ts', ts('@shared/schemas/module')],
  ['shared/x.ts', ts('./schemas/module')],
  ['server/models/module/x.ts', ts('@shared/schemas/module')],
  ['server/models/module/x.ts', ts('./enum')],
  ['server/config/x.ts', ts('./constants')],
  ['server/services/utils/x.ts', ts('../../models/module/type')],
  ['server/services/utils/x.ts', ts('./error')],
  ['server/services/x.ts', ts('./utils/error')],
  ['server/infra/x.ts', ts('./db')],
  ['server/middleware/x.ts', ts('../infra/db')],
  ['server/middleware/x.ts', ts('../services/logger')],
  ['functions/api/x.ts', ts('../../server/api/module/controller')],
  ['functions/api/x.ts', ts('../../server/middleware/handler')],
  ['functions/api/x.ts', ts('../../server/config/constants')],
  ['functions/api/x.ts', ts('@shared/schemas/module')],
  ['server/api/module/controller.ts', ts('./service')],
  ['server/api/module/controller.ts', ts('../../middleware/handler')],
  ['server/api/module/service.ts', ts('../../infra/db')],
  ['server/api/module/service.ts', ts('../../services/utils/pagination')],
  ['server/api/other/controller.ts', ts('../module/controller')],
  ['server/api/module/model.ts', ts('../../models/module/enum')],
  ['server/services/x.ts', 'void env.SECRET\n'],
]

describe('import boundaries', () => {
  it.each(refused)('%s is refused: %s', async (file, code, says) => {
    const messages = await boundaryMessages(file, code)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toContain(says)
  })

  it.each(allowed)('%s is allowed: %s', async (file, code) => {
    expect(await boundaryMessages(file, code)).toEqual([])
  })
})
