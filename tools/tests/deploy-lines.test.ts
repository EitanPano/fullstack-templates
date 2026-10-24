import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..', '..')
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8').replaceAll('\r\n', '\n')

// The body of every `# @<name>-start` ... `# @<name>-end` block, markers dropped.
function regions(text: string, name: string): string[] {
  const found: string[] = []
  let current: string[] | null = null
  for (const line of text.split('\n')) {
    if (line.trim() === `# @${name}-start`) current = []
    else if (line.trim() === `# @${name}-end` && current !== null) {
      found.push(current.join('\n'))
      current = null
    } else current?.push(line)
  }
  return found
}

// AGENTS.md cannot carry a line marker inside a code block, and a lone server has no frontend
// directory to substitute, so the document spells these two differently from the fragment.
const asDocumented = (text: string) =>
  text.replaceAll(/ # @server$/gm, '').replaceAll('__FRONTEND_DIR__', '<frontend dir>')

// Each `AGENTS.md › Deployment` must hold, verbatim, every line its template switches by mode, so
// an agent can move a generated project (which has only its own mode's lines) to the other mode.
describe('AGENTS.md › Deployment carries the lines of both modes', () => {
  const cases: Array<[string, string[]]> = [
    ['frontend/react', ['compose.yaml']],
    ['server/bun-express', ['compose.yaml', 'base/Dockerfile']],
    ['server/python-fastapi', ['compose.yaml', 'base/Dockerfile']],
  ]
  for (const [template, files] of cases) {
    for (const file of files) {
      test(`${template}/${file}`, () => {
        const agents = read(`${template}/base/AGENTS.md`)
        const source = read(`${template}/${file}`)
        const blocks = [...regions(source, 'single'), ...regions(source, 'nosingle')]
        expect(blocks.length).toBeGreaterThan(0)
        for (const block of blocks) expect(agents).toContain(asDocumented(block))
      })
    }
  }
})
