// The api/admin/<entity>/ import rules of eslint.config.mjs, proved through the real config: an
// admin entity is an entity like any other, so it reaches a top-level entity's data through that entity's
// controller and nothing reaches its service. The files linted here do not exist on disk.
import path from 'node:path'

import { describe, expect, it } from 'bun:test'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'

const root = path.resolve(import.meta.dirname, '..')
// The import rules need no type information, and a file that is not on disk has none.
const eslint = new ESLint({
  cwd: root,
  overrideConfig: [
    { languageOptions: { parserOptions: { projectService: false } } },
    tseslint.configs.disableTypeChecked,
  ],
})

const RULES = new Set(['import-x/no-restricted-paths', '@typescript-eslint/no-restricted-imports'])

async function messages(file: string, source: string): Promise<string[]> {
  const code = `import { x } from '${source}'\nvoid x\n`
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.has(message.ruleId))
    .map((message) => message.message)
}

describe('api/admin/<entity>/ boundaries', () => {
  it('lets an admin entity follow the entity rules', async () => {
    const lead = 'src/api/admin/lead'
    expect(await messages(`${lead}/routes.ts`, './controller')).toEqual([])
    expect(await messages(`${lead}/routes.ts`, '../../../middleware/validate')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, './service')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../../entity/controller')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../../entity/schema')).toEqual([])
    expect(await messages(`${lead}/service.ts`, '../../../services/db')).toEqual([])
    expect(await messages(`${lead}/schema.ts`, '../../entity/schema')).toEqual([])
  })

  it('lets the namespace router mount an admin entity and nothing else mount one', async () => {
    expect(await messages('src/api/admin/routes.ts', './lead/routes')).toEqual([])
    expect(await messages('src/config/routes.ts', '../api/admin/routes')).toEqual([])
    expect(await messages('src/api/admin/other/routes.ts', '../lead/routes')).not.toEqual([])
    expect(await messages('src/api/entity/routes.ts', '../admin/lead/routes')).not.toEqual([])
  })

  it('refuses a top-level entity importing an admin entity service', async () => {
    const found = await messages('src/api/entity/controller.ts', '../admin/lead/service')

    expect(found.join(' ')).toContain('service.ts')
  })

  it('refuses an admin entity importing a top-level entity service', async () => {
    const found = await messages('src/api/admin/lead/controller.ts', '../../entity/service')

    expect(found.join(' ')).toContain("entity's controller.ts")
  })

  it('refuses the other ways an admin entity reaches into an entity or a sibling', async () => {
    const lead = 'src/api/admin/lead'
    expect(await messages(`${lead}/service.ts`, '../../entity/service')).not.toEqual([])
    expect(await messages(`${lead}/routes.ts`, '../../entity/controller')).not.toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../other/service')).not.toEqual([])
    expect(await messages(`${lead}/schema.ts`, '../../entity/controller')).not.toEqual([])
  })
})
