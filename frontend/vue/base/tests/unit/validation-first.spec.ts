// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The build splits shared code into chunks, and a chunk's modules run before the importing
// chunk's own body. So `main.ts` importing the zod configuration is not enough: a module that
// builds a schema at load must import the configuration itself, as its first import, so it runs
// first in whatever chunk they share (see src/shared/validators/zod-config.ts).
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path)
    return /\.(ts|vue)$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name) ? [path] : []
  })
}

// True when the text has a run-time import statement of zod or the generated zod schemas. Each
// statement runs from its `import` to its own `from '<source>'`, across lines (Prettier wraps a
// long one), in either quote; `import type` and side-effect imports are not matches.
function importsZodAtRunTime(text: string): boolean {
  const statements = text.matchAll(/^import\s+(?!type\b)([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)
  return [...statements].some(([, , source]) =>
    /^(zod|@\/services\/generated\/zod\.gen)$/.test(source ?? ''),
  )
}

describe('importsZodAtRunTime', () => {
  it('sees a wrapped multi-line value import of the generated schemas', () => {
    const text =
      "import {\n  zCredentials,\n  zOtpVerificationBody,\n} from '@/services/generated/zod.gen'\n"

    expect(importsZodAtRunTime(text)).toBe(true)
  })

  it('sees a double-quoted import', () => {
    expect(importsZodAtRunTime('import { z } from "zod"\n')).toBe(true)
  })

  it('ignores a multi-line type import', () => {
    const text = "import type {\n  ZodType,\n  ZodObject,\n} from 'zod'\n"

    expect(importsZodAtRunTime(text)).toBe(false)
  })
})

describe('modules that build zod schemas', () => {
  const builders = sources('src').filter((path) => {
    if (path.replaceAll('\\', '/').endsWith('src/shared/validators/zod-config.ts')) return false
    return importsZodAtRunTime(readFileSync(path, 'utf8'))
  })

  it('finds the modules that import zod at run time', () => {
    expect(builders.length).toBeGreaterThan(0)
  })

  it.each(builders)('%s imports the zod configuration first', (path) => {
    const first = /^import .*$/m.exec(readFileSync(path, 'utf8'))?.[0]

    expect(first).toBe("import '@/shared/validators/zod-config'")
  })
})
