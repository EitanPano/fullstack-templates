// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// The build splits shared code into chunks, and a chunk's modules run before the importing
// chunk's own body. The validation facade turns zod's eval probe off as it loads, so a module that
// builds a schema at load (anything that imports the generated schemas) must import the facade
// itself, as its first import, so it runs first in whatever chunk they share (see
// src/shared/utils/validation.ts).
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(path)
    return /\.(ts|vue)$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name) ? [path] : []
  })
}

// True when the text has a run-time import statement of the generated zod schemas. Each statement
// runs from its `import` to its own `from '<source>'`, across lines (Prettier wraps a long one),
// in either quote; `import type` and side-effect imports are not matches.
function importsSchemasAtRunTime(text: string): boolean {
  const statements = text.matchAll(/^import\s+(?!type\b)([^;'"]*?)\s+from\s+['"]([^'"]+)['"]/gm)
  return [...statements].some(([, , source]) => source === '@/services/generated/zod.gen')
}

describe('importsSchemasAtRunTime', () => {
  it('sees a wrapped multi-line value import of the generated schemas', () => {
    const text =
      "import {\n  zCredentials,\n  zOtpVerificationBody,\n} from '@/services/generated/zod.gen'\n"

    expect(importsSchemasAtRunTime(text)).toBe(true)
  })

  it('sees a double-quoted import', () => {
    const text = 'import { zCredentials } from "@/services/generated/zod.gen"\n'

    expect(importsSchemasAtRunTime(text)).toBe(true)
  })

  it('ignores a multi-line type import', () => {
    const text = "import type {\n  Credentials,\n  Otp,\n} from '@/services/generated/zod.gen'\n"

    expect(importsSchemasAtRunTime(text)).toBe(false)
  })
})

describe('modules that build schemas', () => {
  // Empty when the project has no generated schemas (no server), which is why the detector above
  // has tests of its own.
  const builders = sources('src').filter((path) =>
    importsSchemasAtRunTime(readFileSync(path, 'utf8')),
  )

  it('finds the modules that import the generated schemas', () => { // @server:auth
    expect(builders.length).toBeGreaterThan(0) // @server:auth
  }) // @server:auth

  it('imports the validation facade first in each module that imports the generated schemas', () => {
    for (const path of builders) {
      const first = /^import .*$/m.exec(readFileSync(path, 'utf8'))?.[0]

      expect(first, path).toBe("import '@/shared/utils/validation'")
    }
  })
})
