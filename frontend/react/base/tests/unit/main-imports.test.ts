// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ES modules run in import order. the validation library decides how it compiles schemas when the first one is
// built, so the module that configures it (the validation facade) comes first; the font face and the brand tokens load
// before the tree that reads them, so a later stylesheet can override a generated value, never the reverse.
describe('main.tsx', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/main.tsx', import.meta.url)), 'utf8')
  const imports = [...source.matchAll(/^import .*$/gm)].map((match) => match[0])

  it('imports the validation facade before anything else', () => {
    expect(imports[0]).toBe("import '@/shared/utils/validation'")
  })

  it('reloads the page when a chunk is gone after a redeploy', () => {
    expect(source).toMatch(
      /window\.addEventListener\('vite:preloadError', \(\) => \{\s*window\.location\.reload\(\)\s*\}\)/,
    )
  })

  it('imports the font, then brand.css, then styles.scss', () => {
    const styles = imports.filter((line) => /\.s?css'|fontsource/.test(line))

    expect(styles).toEqual([
      "import '@fontsource-variable/inter'",
      "import '@/styles/themes/brand.css'",
      "import '@/styles/styles.scss'",
    ])
  })

  it('imports the validation facade, then the font, then the stylesheets', () => {
    expect(imports.slice(0, 4)).toEqual([
      "import '@/shared/utils/validation'",
      "import '@fontsource-variable/inter'",
      "import '@/styles/themes/brand.css'",
      "import '@/styles/styles.scss'",
    ])
  })
})
