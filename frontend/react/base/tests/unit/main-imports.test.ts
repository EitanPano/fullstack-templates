// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ES modules run in import order. zod decides how it compiles schemas when the first one is
// built, so the module that configures it comes first; the brand tokens load before the tree
// that reads them, so a later stylesheet can override a generated value, never the reverse.
describe('main.tsx', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/main.tsx', import.meta.url)), 'utf8')
  const imports = [...source.matchAll(/^import .*$/gm)].map((match) => match[0])

  it('imports the zod configuration before anything else', () => {
    expect(imports[0]).toBe("import '@/shared/utils/zod-messages'")
  })

  it('imports brand.css, then styles.scss, and nothing else imports a stylesheet', () => {
    const styles = imports.filter((line) => /\.s?css'/.test(line))

    expect(styles).toEqual(["import '@/styles/themes/brand.css'", "import '@/styles/styles.scss'"])
  })
})
