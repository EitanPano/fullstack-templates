import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The build splits shared code into chunks, and a chunk's modules run before the importing
// chunk's own body. The validation facade turns zod's eval probe off as it loads (a page whose
// policy has no 'unsafe-eval' reports the probe), so a module that builds a schema at load
// (anything that imports the generated zod schemas) must import the facade itself, as its first
// import, so it runs first in whatever chunk they share (see src/services/validation.ts).
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path)
    return /\.(tsx?|astro)$/.test(entry.name) ? [path] : []
  })
}

// The code of a source file: the file itself, or for an .astro file its frontmatter and each of its
// <script> blocks, which are separate modules (the first import of each is what counts).
function codeBlocks(path: string, text: string): string[] {
  if (!path.endsWith('.astro')) return [text]
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
  const scripts = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => match[1] ?? '',
  )
  return [...(frontmatter === undefined ? [] : [frontmatter]), ...scripts]
}

// True when the text has a run-time import statement of the generated zod schemas. Each statement
// runs from its `import` to its own `from '<source>'`, across lines (Prettier wraps a long one),
// in either quote; `import type` and side-effect imports are not matches.
function importsSchemasAtRunTime(text: string): boolean {
  const statements = text.matchAll(/^import\s+(?!type\b)([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)
  return [...statements].some(([, , source]) => /(^|\/)generated\/zod\.gen$/.test(source ?? ''))
}

const FACADE = /^import ['"](\.\.?\/)+(services\/)?validation['"]/

describe('importsSchemasAtRunTime', () => {
  it('sees a wrapped multi-line value import of the generated schemas', () => {
    const text = "import {\n  zThing,\n  zOther,\n} from '../services/generated/zod.gen'\n"

    expect(importsSchemasAtRunTime(text)).toBe(true)
  })

  it('sees a double-quoted import', () => {
    expect(importsSchemasAtRunTime('import { zThing } from "./generated/zod.gen"\n')).toBe(true)
  })

  it('ignores a multi-line type import', () => {
    const text = "import type {\n  Thing,\n  Other,\n} from '../services/generated/zod.gen'\n"

    expect(importsSchemasAtRunTime(text)).toBe(false)
  })
})

describe('codeBlocks', () => {
  const frontmatter = "---\nimport { zThing } from '../services/generated/zod.gen'\n---\n<h1>t</h1>\n"

  it('takes the frontmatter and every script of an .astro file as its own module', () => {
    const text = `${frontmatter}<script>\nimport './a'\n</script>\n<script is:inline>\nvoid 0\n</script>\n`

    expect(codeBlocks('x.astro', text).map((block) => block.trim())).toEqual([
      "import { zThing } from '../services/generated/zod.gen'",
      "import './a'",
      'void 0',
    ])
  })

  it('finds a schema import in a frontmatter and in a script block', () => {
    const inScript = `<h1>t</h1>\n<script>\nimport { zThing } from '../services/generated/zod.gen'\n</script>\n`

    expect(codeBlocks('x.astro', frontmatter).some(importsSchemasAtRunTime)).toBe(true)
    expect(codeBlocks('x.astro', inScript).some(importsSchemasAtRunTime)).toBe(true)
    expect(codeBlocks('x.astro', '<h1>t</h1>\n').some(importsSchemasAtRunTime)).toBe(false)
  })

  it('takes a .ts file whole', () => {
    expect(codeBlocks('x.ts', 'a')).toEqual(['a'])
  })
})

describe('modules that build schemas', () => {
  // Empty until a service, a page or a script imports the generated schemas, which is why the
  // detector above has tests of its own. Each .astro frontmatter and <script> is its own module.
  const builders = sources('src').flatMap((path) =>
    codeBlocks(path, readFileSync(path, 'utf8'))
      .filter((block) => importsSchemasAtRunTime(block))
      .map((block) => ({ path, block })),
  )

  it('imports the validation facade first in each module that imports the generated schemas', () => {
    for (const { path, block } of builders) {
      const first = /^import .*$/m.exec(block)?.[0]

      expect(first, path).toMatch(FACADE)
    }
  })
})
