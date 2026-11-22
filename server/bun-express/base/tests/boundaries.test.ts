// The api/admin/<module>/ import rules of eslint.config.mjs, proved through the real config: an
// admin module is a module like any other, so it reaches an entity's data through that entity's
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

describe('api/admin/<module>/ boundaries', () => {
  it('lets an admin module follow the module rules', async () => {
    const lead = 'src/api/admin/lead'
    expect(await messages(`${lead}/routes.ts`, './controller')).toEqual([])
    expect(await messages(`${lead}/routes.ts`, '../../../middleware/validate')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, './service')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../../module/controller')).toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../../module/schema')).toEqual([])
    expect(await messages(`${lead}/service.ts`, '../../../services/db')).toEqual([])
    expect(await messages(`${lead}/schema.ts`, '../../module/schema')).toEqual([])
  })

  it('lets the namespace router mount an admin module and nothing else mount one', async () => {
    expect(await messages('src/api/admin/routes.ts', './lead/routes')).toEqual([])
    expect(await messages('src/config/routes.ts', '../api/admin/routes')).toEqual([])
    expect(await messages('src/api/admin/other/routes.ts', '../lead/routes')).not.toEqual([])
    expect(await messages('src/api/module/routes.ts', '../admin/lead/routes')).not.toEqual([])
  })

  it('refuses an entity module importing an admin module service', async () => {
    const found = await messages('src/api/module/controller.ts', '../admin/lead/service')

    expect(found.join(' ')).toContain('service.ts')
  })

  it('refuses an admin module importing an entity module service', async () => {
    const found = await messages('src/api/admin/lead/controller.ts', '../../module/service')

    expect(found.join(' ')).toContain("entity's controller.ts")
  })

  it('refuses the other ways an admin module reaches into an entity or a sibling', async () => {
    const lead = 'src/api/admin/lead'
    expect(await messages(`${lead}/service.ts`, '../../module/service')).not.toEqual([])
    expect(await messages(`${lead}/routes.ts`, '../../module/controller')).not.toEqual([])
    expect(await messages(`${lead}/controller.ts`, '../other/service')).not.toEqual([])
    expect(await messages(`${lead}/schema.ts`, '../../module/controller')).not.toEqual([])
  })
})
