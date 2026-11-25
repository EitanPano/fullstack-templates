// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { frameHtml, joinStyles, major } from '../../tsdown.shared.ts'

const dirs: string[] = []
const project = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-build-'))
  dirs.push(root)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  return root
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const SHEETS = ['src/modules/*/frame.css', 'src/modules/*/frame/**/*.css']

describe('the frame stylesheet', () => {
  it('holds the base, then each module sheet in path order', () => {
    const root = project({
      'src/frame/base.css': '/* base */',
      'src/modules/zeta/frame.css': '/* zeta */',
      'src/modules/alpha/frame/b.css': '/* alpha b */',
      'src/modules/alpha/frame/a.css': '/* alpha a */',
      'src/modules/alpha/frame.css': '/* alpha */',
      'src/modules/alpha/host.ts': 'not a sheet',
    })
    const { css, files } = joinStyles(root, SHEETS)
    expect(css.indexOf('/* base */')).toBe(0)
    const order = ['/* base */', '/* alpha */', '/* alpha a */', '/* alpha b */', '/* zeta */']
    expect(order.map((marker) => css.indexOf(marker))).toEqual(
      [...order.map((marker) => css.indexOf(marker))].sort((a, b) => a - b),
    )
    expect(order.every((marker) => css.includes(marker))).toBe(true)
    expect(files.map((file) => file.replaceAll('\\', '/').split('/src/')[1])).toEqual([
      'frame/base.css',
      'modules/alpha/frame.css',
      'modules/alpha/frame/a.css',
      'modules/alpha/frame/b.css',
      'modules/zeta/frame.css',
    ])
  })

  it('is the base alone when no module has a sheet', () => {
    const root = project({ 'src/frame/base.css': '/* base */' })
    expect(joinStyles(root, SHEETS).css.trim()).toBe('/* base */')
  })

  it('takes the sheets of a glob list given to it, as the e2e build gives the fixture sheet', () => {
    const root = project({
      'src/frame/base.css': '/* base */',
      'tests/e2e/fixture-module/frame.css': '/* fixture */',
      'src/modules/real/frame.css': '/* real */',
    })
    const { css } = joinStyles(root, ['tests/e2e/fixture-module/frame.css'])
    expect(css).toContain('/* fixture */')
    expect(css).not.toContain('/* real */')
  })

  it('fails when the base sheet is missing', () => {
    expect(() => joinStyles(project({}), SHEETS)).toThrow(/base\.css/)
  })

  it('does not check the base sheet, or a sheet outside src/modules', () => {
    const root = project({
      'src/frame/base.css': 'body { margin: 0 }\n:root { --sdk-text: #000 }',
      'tests/e2e/fixture-module/frame.css': '.x { color: red }',
    })
    expect(() => joinStyles(root, ['tests/e2e/fixture-module/frame.css'])).not.toThrow()
  })

  it('is linked from the frame document, in the head and before the script', () => {
    const html = frameHtml()
    const link = `<link rel="stylesheet" href="/api/sdk/dist/v${major}/frame.css">`
    expect(html).toContain(link)
    expect(html.indexOf(link)).toBeLessThan(html.indexOf('</head>'))
    expect(html.indexOf(link)).toBeLessThan(html.indexOf('<script'))
  })
})

describe("a module's sheet", () => {
  const sheet = (css: string, name = 'alpha') =>
    project({
      'src/frame/base.css': '/* base */',
      [`src/modules/${name}/frame.css`]: css,
    })
  const joined =
    (css: string, name = 'alpha') =>
    () =>
      joinStyles(sheet(css, name), SHEETS)

  it.each([
    ['one rule', "[data-module='alpha'] .x { color: red }"],
    ['double quotes', '[data-module="alpha"] .x { color: red }'],
    ['the scope alone', "[data-module='alpha'] { padding: 4px }"],
    ['a selector list', "[data-module='alpha'] .a,\n[data-module='alpha'] .b { color: red }"],
    [
      'a nested rule of @media',
      "@media (min-width: 400px) {\n  [data-module='alpha'] .x { color: red }\n}",
    ],
    ['@supports', "@supports (display: grid) { [data-module='alpha'] .x { display: grid } }"],
    ['@container', "@container (min-width: 10px) { [data-module='alpha'] .x { color: red } }"],
    ['@keyframes with its steps', '@keyframes fade { from { opacity: 0 } to { opacity: 1 } }'],
    [
      'comments, even one with a bad rule in it',
      "/* body { x } url(a) */ [data-module='alpha'] .x { color: red }",
    ],
    ['a data-module value in a string', "[data-module='alpha'] [title='}'] { color: red }"],
    ['an empty sheet', ''],
  ])('passes %s', (_name, css) => {
    expect(joined(css)).not.toThrow()
  })

  it.each([
    ['@import', "@import 'other.css';", '@import'],
    ['@font-face', '@font-face { font-family: x; src: local(x) }', '@font-face'],
    ['url(', "[data-module='alpha'] .x { background: url( data:x ) }", 'url('],
    ['a rule with no scope', '.x { color: red }', '.x'],
    ['a rule on the body', 'body { margin: 0 }', 'body'],
    ['a rule on :root', ':root { --sdk-text: red }', ':root'],
    [
      'the scope of another module',
      "[data-module='beta'] .x { color: red }",
      "[data-module='beta']",
    ],
    [
      'a prefix of the scope',
      "[data-module='alpha-two'] .x { color: red }",
      "[data-module='alpha-two']",
    ],
    ['a scope that is not first', ".y [data-module='alpha'] .x { color: red }", '.y'],
    [
      'one bad member of a selector list',
      "[data-module='alpha'] .a, body .b { color: red }",
      'body .b',
    ],
    [
      'a bad rule inside @media',
      "@media (min-width: 400px) { [data-module='alpha'] .a { color: red } .b { color: red } }",
      '.b',
    ],
    ['a bad rule inside @supports', '@supports (display: grid) { html { display: grid } }', 'html'],
    ['a bad rule inside @container', '@container (min-width: 10px) { .x { color: red } }', '.x'],
    [
      'a bad rule after a good one, and it names the line',
      "[data-module='alpha'] .a { color: red }\n\n.b { color: red }",
      ':3',
    ],
  ])('fails on %s, naming the file and the line', (_name, css, mention) => {
    expect(joined(css)).toThrow('src/modules/alpha/frame.css:')
    expect(joined(css)).toThrow(mention)
  })

  it('checks a sheet under the frame folder of a module, against the module folder name', () => {
    const root = project({
      'src/frame/base.css': '/* base */',
      'src/modules/alpha/frame/part.css': "[data-module='beta'] .x { color: red }",
    })
    expect(() => joinStyles(root, SHEETS)).toThrow('src/modules/alpha/frame/part.css:1')
  })

  it('counts braces, so a rule after a closed @media block is still checked', () => {
    const css =
      "@media (min-width: 1px) { [data-module='alpha'] .a { color: red } }\n.b { color: red }"
    expect(joined(css)).toThrow(/frame\.css:2/)
  })
})
