// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compile } from 'tailwindcss'
import { describe, expect, it } from 'vitest'

// Compiles the real `@custom-variant compact` from globals.css and checks where Tailwind puts
// the rule. `compact:h-8` and `pointer-coarse:h-11` have equal specificity and resolve by source
// order, so compact must exist only inside a fine-pointer media query or it beats touch sizing.
const css = readFileSync(
  fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)),
  'utf8',
)
const variant = /@custom-variant compact[^;{]*(\{[\s\S]*?\n\}|;)/.exec(css)?.[0]

async function build(...candidates: string[]) {
  const compiler = await compile(`@theme { --spacing: 0.25rem; }
@tailwind utilities;
${variant ?? ''}`)
  return compiler.build(candidates)
}

describe('compact density', () => {
  it('is declared in globals.css', () => {
    expect(variant).toBeDefined()
  })

  it('applies only on a fine pointer, so touch keeps 44 px', async () => {
    const output = await build('compact:h-8')

    const at = output.indexOf('data-density')
    expect(at).toBeGreaterThan(-1)
    expect(output.slice(0, at)).toContain('@media (pointer: fine)')
  })
})
