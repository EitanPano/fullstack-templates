// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// ES modules run in import order. The font face and the brand tokens load before the tree that
// reads them, so a later stylesheet can override a generated value, never the reverse; the plugins
// are installed before the app mounts.
describe('main.ts', () => {
  const source = readFileSync(fileURLToPath(new URL('../../src/main.ts', import.meta.url)), 'utf8')
  const imports = [...source.matchAll(/^import .*$/gm)].map((match) => match[0])

  it('imports the font, then brand.css, then styles.scss, before any code', () => {
    expect(imports.slice(0, 3)).toEqual([
      "import '@fontsource-variable/inter'",
      "import '@/styles/themes/brand.css'",
      "import '@/styles/styles.scss'",
    ])
  })

  it('imports a stylesheet nowhere else', () => {
    expect(imports.filter((line) => /\.s?css'|fontsource/.test(line))).toHaveLength(3)
  })

  it('installs the guarded reload for a chunk that is gone after a redeploy', () => {
    expect(source).toContain("from '@/core/initializers/preload-error'")
    expect(source).toMatch(/^installPreloadReload\(\)$/m)
  })

  it('configures the validation library before the app, and so before any schema is built', () => {
    const zod = imports.indexOf("import '@/shared/utils/validation'")
    const app = imports.findIndex((line) => line.includes('@/app/App.vue'))

    expect(zod).toBeGreaterThan(-1)
    expect(zod).toBeLessThan(app)
  })

  it('installs the plugins, then mounts on #app', () => {
    const install = source.indexOf('installPlugins(app)')
    const mount = source.indexOf("app.mount('#app')")

    expect(install).toBeGreaterThan(-1)
    expect(mount).toBeGreaterThan(install)
  })
})
