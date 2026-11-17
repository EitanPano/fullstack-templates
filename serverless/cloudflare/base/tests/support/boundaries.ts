// boundaries.ts belongs: linting a snippet as if it sat at a path, through the real
// eslint.config.mjs, and returning the messages of the import rules only. It does not belong:
// the cases (tests/unit/boundaries*.test.ts).
import path from 'node:path'

import { ESLint } from 'eslint'

const root = path.resolve(import.meta.dirname, '../..')
const eslint = new ESLint({ cwd: root })

const RULES = new Set([
  'import-x/no-restricted-paths',
  'no-restricted-imports',
  'no-restricted-properties',
  'no-restricted-syntax',
])

export async function boundaryMessages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.has(message.ruleId))
    .map((message) => message.message)
}

export const ts = (source: string) => `import { x } from '${source}'\nvoid x\n`
