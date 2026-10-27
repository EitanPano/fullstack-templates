// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ES modules run in import order. zod decides how it compiles schemas when the first one is
// built, so the module that configures it must be the first thing the entry point imports.
describe('main.tsx', () => {
  it('imports the zod configuration before anything else', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/main.tsx', import.meta.url)),
      'utf8',
    )
    const first = /^import .*$/m.exec(source)?.[0]

    expect(first).toBe("import '@/shared/lib/zod-messages'")
  })
})
