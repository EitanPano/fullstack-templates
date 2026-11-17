// The import rules of eslint.config.mjs, proved through the real config: one violation and one
// allowed case per rule, each violation's message naming the layer to use instead. The snippets are
// linted as virtual files at a real path of the project, so every import resolves to a file that
// exists (the zone rule classifies a dependency by the file it resolves to).
import path from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const eslint = new ESLint({ cwd: root })

const RULES = new Set([
  'import-x/no-restricted-paths',
  'no-restricted-imports',
  'no-restricted-syntax',
])

async function boundaryMessages(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) })
  return (result?.messages ?? [])
    .filter((message) => message.ruleId !== null && RULES.has(message.ruleId))
    .map((message) => message.message)
}

const astro = (source: string) => `---\nimport { x } from '${source}'\nvoid x\n---\n<p />\n`
const ts = (source: string) => `import { x } from '${source}'\nvoid x\n`
const astroType = (source: string) => `---\nimport type { X } from '${source}'\nvoid (0 as unknown as X)\n---\n<p />\n` // @server
const tsType = (source: string) => `import type { X } from '${source}'\nvoid (0 as unknown as X)\n` // @server
const markup = (html: string) => `---\n---\n${html}\n`
const script = (code: string) => `---\n---\n<p />\n<script>\n  ${code}\n</script>\n`

// [file, code, the words the message must carry]
const refused: [string, string, string][] = [
  // The layer map: pages > layouts > components > services > models.
  ['src/services/x.ts', ts('../components/ui/button/button.astro'), 'services/ is the data'],
  ['src/services/x.ts', ts('../layouts/base-layout.astro'), 'never a component'],
  ['src/services/x.ts', ts('../pages/index.astro'), 'layout or a page'],
  ['src/services/x.ts', ts('../nav'), 'services/ is the data'],
  ['src/models/theme/x.ts', ts('../../components/ui/button/button.astro'), 'models/ is a leaf'],
  ['src/models/theme/x.ts', ts('../../layouts/base-layout.astro'), 'models/ is a leaf'],
  ['src/models/theme/x.ts', ts('../../services/theme'), 'models/ is a leaf'],
  ['src/models/theme/x.ts', ts('../../nav'), 'models/ is a leaf'],
  ['src/nav.ts', ts('./services/theme'), 'nav.ts is a table'],
  ['src/nav.ts', ts('./pages/index.astro'), 'nav.ts is a table'],
  ['src/components/ui/button/x.ts', ts('../../../layouts/base-layout.astro'), 'placed by a layout'],
  ['src/components/ui/button/x.ts', ts('../../../pages/index.astro'), 'placed by a layout'],
  ['src/layouts/x.astro', astro('../pages/index.astro'), 'pages import layouts'],
  // @server-start
  // The generated client's runtime belongs to the data layer.
  ['src/pages/x.astro', astro('../services/generated/sdk.gen'), 'only src/services/'],
  ['src/layouts/x.astro', astro('../services/generated/client.gen'), 'only src/services/'],
  ['src/components/ui/x/x.ts', ts('../../../services/generated/sdk.gen'), 'only src/services/'],
  ['src/models/theme/x.ts', ts('../../services/generated/zod.gen'), 'only src/services/'],
  // @server-end
  // Controls belong to the kit, zod to its facade, fetch to the generated client's wrapper.
  ['src/pages/x.astro', markup('<button type="button">Go</button>'), 'kit'],
  ['src/pages/x.astro', markup('<input name="a" />'), 'kit'],
  ['src/layouts/x.astro', markup('<select name="a"></select>'), 'kit'],
  ['src/pages/x.astro', markup('<textarea name="a"></textarea>'), 'kit'],
  ['src/services/x.ts', "void document.createElement('button')\n", 'kit'],
  ['src/pages/x.astro', script("void document.createElement('input')"), 'kit'],
  ['src/services/x.ts', ts('zod'), 'validation.ts'],
  ['src/pages/x.astro', astro('zod'), 'validation.ts'],
  ['src/components/ui/x/x.ts', ts('zod/v4'), 'validation.ts'],
  ['src/services/x.ts', "void fetch('/api/health')\n", 'services/api.ts'],
  ['src/components/ui/toast/x.ts', "void fetch('/api/health')\n", 'services/api.ts'],
  ['src/pages/x.astro', script("void window.fetch('/api/health')"), 'services/api.ts'],
  // Configuration has one reader.
  ['src/services/x.ts', 'void import.meta.env.PUBLIC_X\n', 'src/env.ts'],
  ['src/pages/x.astro', script('void import.meta.env.PUBLIC_X'), 'src/env.ts'],
  ['src/services/x.ts', 'void process.env.X\n', 'src/env.ts'],
  // The policy has no 'unsafe-inline'.
  ['src/pages/x.astro', markup('<p onclick="go()">x</p>'), 'inline event-handler'],
  ['src/components/ui/x/x.astro', markup('<p style="color: red">x</p>'), 'style attribute'],
  // An island is a component: the same layers, and no style prop or inline handler.
  [
    'src/components/islands/counter/counter.tsx',
    ts('../../../pages/index.astro'),
    'placed by a layout',
  ],
  [
    'src/components/islands/counter/counter.tsx',
    ts('../../../layouts/base-layout.astro'),
    'placed by a layout',
  ],
  ['src/components/islands/counter/counter.tsx', ts('zod'), 'validation.ts'],
  ['src/components/islands/counter/counter.tsx', "void fetch('/api/health')\n", 'services/api.ts'],
  // @server-start
  [
    'src/components/islands/counter/counter.tsx',
    ts('../../../services/generated/sdk.gen'),
    'only src/services/',
  ],
  // @server-end
  [
    'src/components/islands/counter/counter.tsx',
    "export const View = () => <p style={{ color: 'red' }}>x</p>\n",
    'style attribute',
  ],
  [
    'src/components/islands/counter/counter.tsx',
    'export const View = () => <p onclick="go()">x</p>\n',
    'inline event-handler',
  ],
]

const allowed: [string, string][] = [
  ['src/pages/x.astro', astro('../layouts/base-layout.astro')],
  ['src/pages/x.astro', astro('../components/ui/button/button.astro')],
  ['src/pages/x.astro', astro('../services/theme')],
  ['src/pages/x.astro', astro('../models/theme/constant')],
  ['src/pages/x.astro', astro('../nav')],
  ['src/pages/x.astro', markup('<a href="/">Home</a>\n<label for="a">A</label>')],
  ['src/layouts/x.astro', astro('../components/ui/button/button.astro')],
  ['src/layouts/x.astro', astro('../models/ui/constant')],
  ['src/components/ui/x/x.ts', ts('../../../services/theme')],
  ['src/components/ui/x/x.ts', ts('../../../models/ui/constant')],
  ['src/components/ui/x/x.ts', ts('../button/button.astro')],
  ['src/services/x.ts', ts('../models/theme/constant')],
  ['src/services/x.ts', ts('./theme')],
  ['src/models/theme/x.ts', ts('./constant')],
  ['src/models/theme/x.ts', ts('../ui/constant')],
  ['src/nav.ts', ts('./models/nav/type')],
  ['src/services/validation.ts', ts('zod')],
  ['src/services/x.ts', "void document.createElement('div')\n"],
  ['src/env.ts', 'void import.meta.env.PUBLIC_X\n'],
  // The kit is the one place for a control.
  ['src/components/ui/x/x.astro', markup('<button type="button">Go</button>')],
  ['src/components/ui/x/x.astro', markup('<input name="a" />')],
  ['src/components/ui/toast/x.ts', "void document.createElement('button')\n"],
  // @server-start
  // The generated client: its runtime in services/, its types anywhere.
  ['src/services/x.ts', ts('./generated/sdk.gen')],
  ['src/services/api.ts', ts('./generated/client.gen')],
  ['src/models/api/x.ts', tsType('../../services/generated/types.gen')],
  ['src/pages/x.astro', astroType('../services/generated/types.gen')],
  ['src/components/ui/x/x.ts', tsType('../../../services/generated/types.gen')],
  // @server-end
  // An island: React elements, the data layer and the models.
  ['src/components/islands/counter/counter.tsx', "export const View = () => <button type=\"button\">x</button>\n"],
  ['src/components/islands/counter/counter.tsx', ts('../../../services/theme')],
  ['src/components/islands/counter/counter.tsx', ts('../../../models/ui/constant')],
  ['src/components/islands/counter/counter.tsx', ts('../../ui/button/button.astro')],
]

describe('import boundaries', () => {
  it.each(refused)('%s is refused: %s', async (file, code, says) => {
    const messages = await boundaryMessages(file, code)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toContain(says)
  })

  it.each(allowed)('%s is allowed: %s', async (file, code) => {
    expect(await boundaryMessages(file, code)).toEqual([])
  })
})
