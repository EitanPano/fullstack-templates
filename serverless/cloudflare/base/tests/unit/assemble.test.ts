// The assemble step on fixture output directories: what lands in dist/, how pages/ is laid over a
// frontend's files, and what makes it refuse.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AssembleError, assemble } from '../../scripts/lib/assemble.mjs'
import { FIXED_POLICY } from '../../scripts/lib/csp-headers.mjs'

const HASH_A = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const HASH_B = "'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='"
const STYLE = "'sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='"
const policy = (script: string) => `script-src 'self' ${script}; style-src 'self' ${STYLE};`
const page = (content: string | null) =>
  `<!doctype html><html><head>${
    content === null ? '' : `<meta http-equiv="content-security-policy" content="${content}">`
  }<title>t</title></head><body><h1>t</h1></body></html>`

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

// A scratch project: pages/ as the template ships it, an optional frontend output, an empty dist.
function project(frontend: Record<string, string> | null) {
  const root = mkdtempSync(path.join(tmpdir(), 'assemble-'))
  roots.push(root)
  const write = (base: string, files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, base, name)), { recursive: true })
      writeFileSync(path.join(root, base, name), text)
    }
  }
  write('pages', {
    '_routes.json': '{ "version": 1, "include": ["/api/*"], "exclude": [] }\n',
    '_headers': '# base\n/*\n  X-Content-Type-Options: nosniff\n',
    '_redirects': '# none\n',
  })
  if (frontend !== null) write('out', frontend)
  const warnings: string[] = []
  return {
    root,
    write,
    warnings,
    options: {
      pages: path.join(root, 'pages'),
      dist: path.join(root, 'dist'),
      frontend: frontend === null ? null : path.join(root, 'out'),
      warn: (message: string) => warnings.push(message),
    },
    read: (name: string) => readFileSync(path.join(root, 'dist', name), 'utf8'),
  }
}

describe('assemble with a frontend', () => {
  const output = {
    'index.html': page(policy(HASH_A)),
    'about.html': page(policy(HASH_B)),
    '404.html': page(null),
    '_astro/app.js': 'console.log(1)',
    '_headers': '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n',
  }

  it('copies the output, lays pages/ over it and merges _headers, the frontend first', () => {
    const p = project(output)

    assemble(p.options)

    expect(p.read('_astro/app.js')).toBe('console.log(1)')
    expect(p.read('_routes.json')).toContain('/api/*')
    const headers = p.read('_headers')
    expect(headers.indexOf('/_astro/*')).toBeGreaterThanOrEqual(0)
    expect(headers.indexOf('/_astro/*')).toBeLessThan(headers.indexOf('X-Content-Type-Options'))
  })

  it('writes one fixed header line, with no hash and no script or style source', () => {
    const p = project(output)

    const summary = assemble(p.options)

    const lines = p.read('_headers').split('\n').filter((l) => l.includes('Content-Security-Policy'))
    expect(lines).toEqual([`  Content-Security-Policy: ${FIXED_POLICY}`])
    expect(lines[0]).toContain("frame-ancestors 'none'")
    expect(lines[0]).not.toMatch(/default-src|script-src|style-src|sha256|unsafe/)
    expect(summary).toMatchObject({ pages: 3, withPolicy: 2 })
  })

  it('puts the line under the first /* rule of the merged file', () => {
    const p = project(output)

    assemble(p.options)

    const lines = p.read('_headers').split('\n')
    const rule = lines.indexOf('/*')
    const line = lines.findIndex((l) => l.includes('Content-Security-Policy'))
    expect(rule).toBeGreaterThan(-1)
    expect(line).toBeGreaterThan(rule)
    // Every line between the rule and the policy line is an indented header of the same rule.
    expect(lines.slice(rule + 1, line).every((l) => l.startsWith('  '))).toBe(true)
    expect(lines[rule + 1]).toContain('X-Content-Type-Options')
  })

  it('leaves every page as the build wrote it, meta included', () => {
    const p = project(output)

    assemble(p.options)

    expect(p.read('index.html')).toBe(output['index.html'])
    expect(p.read('about.html')).toBe(output['about.html'])
    expect(p.read('404.html')).toBe(output['404.html'])
  })

  it('serves a page without a policy meta as it is and warns once, with a count and its path', () => {
    const p = project(output)

    const summary = assemble(p.options)

    expect(summary.without).toEqual(['404.html'])
    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]).toContain('served without a script policy')
    expect(p.warnings[0]).toContain('1 page')
    expect(p.warnings[0]).toContain('404.html')
  })

  it('names at most ten pages in the warning, and the count of all of them', () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 25; i++) many[`old${String(i).padStart(2, '0')}.html`] = page(null)
    const p = project(many)

    assemble(p.options)

    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]).toContain('25 pages')
    expect(p.warnings[0]).toContain('old09.html')
    expect(p.warnings[0]).not.toContain('old10.html')
  })

  it('does not warn when every page has a policy', () => {
    const p = project({ 'index.html': page(policy(HASH_A)) })

    assemble(p.options)

    expect(p.warnings).toEqual([])
  })

  it('assembles sixty pages with distinct inline-script hashes', () => {
    const pages: Record<string, string> = {}
    for (let i = 0; i < 60; i++) {
      pages[`p${String(i)}.html`] = page(policy(`'sha256-${String(i).padStart(43, 'x')}='`))
    }
    const p = project(pages)

    expect(assemble(p.options)).toMatchObject({ pages: 60, withPolicy: 60 })
    expect(p.read('p59.html')).toContain('content-security-policy')
    expect(p.read('_headers')).toContain(FIXED_POLICY)
  })

  it('lets the frontend have no _headers or _redirects of its own', () => {
    const p = project({ 'index.html': page(policy(HASH_A)) })

    assemble(p.options)

    expect(p.read('_redirects')).toBe('# none\n')
    expect(p.read('_headers')).toContain('Content-Security-Policy')
  })

  it('writes the line even when no page carries a policy', () => {
    const p = project({ 'index.html': page(null) })

    expect(assemble(p.options)).toMatchObject({ withPolicy: 0 })
    expect(p.read('_headers')).toContain(`Content-Security-Policy: ${FIXED_POLICY}`)
  })

  it('replaces a previous dist', () => {
    const p = project(output)
    p.write('dist', { 'stale.html': 'old' })

    assemble(p.options)

    expect(existsSync(path.join(p.root, 'dist', 'stale.html'))).toBe(false)
  })
})

describe('assemble refuses', () => {
  it('a missing frontend output, telling the reader to build it', () => {
    const p = project({ 'index.html': page(null) })
    rmSync(path.join(p.root, 'out'), { recursive: true })

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/build the frontend first/)
  })

  it.each([
    ["'unsafe-inline'", "script-src 'self' 'unsafe-inline'; style-src 'self';"],
    ["an upper-case 'UNSAFE-INLINE'", "script-src 'self' 'UNSAFE-INLINE'; style-src 'self';"],
    ['a wildcard', "script-src *; style-src 'self';"],
    ['data:', "script-src 'self' data:; style-src 'self';"],
    ['https:', "script-src 'self'; style-src https:;"],
    ["'unsafe-hashes'", "script-src 'self' 'unsafe-hashes'; style-src 'self';"],
  ])('a page whose policy allows %s, naming it, and keeps the previous dist', (_label, bad) => {
    const p = project({ 'index.html': page(policy(HASH_A)), 'nested/other.html': page(bad) })
    p.write('dist', { 'previous.html': 'kept' })

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/nested\/other\.html/)
    expect(p.read('previous.html')).toBe('kept')
    expect(existsSync(`${p.options.dist}.assembling`)).toBe(false)
  })

  it('accepts a page whose meta carries other directives', () => {
    const p = project({
      'index.html': page(`default-src 'self'; img-src 'self' data:; ${policy(HASH_A)}`),
    })

    expect(() => assemble(p.options)).not.toThrow()
  })

  it.each([
    ['sets a Content-Security-Policy', '/*\n  Content-Security-Policy: default-src *\n'],
    ['sets it in lower case', '/*\n  content-security-policy: default-src *\n'],
    ['detaches it', '/*\n  ! Content-Security-Policy\n'],
    ['detaches it in capitals', '/*\n  ! CONTENT-SECURITY-POLICY\n'],
  ])('a frontend _headers that %s, naming the file', (_label, headers) => {
    const p = project({ 'index.html': page(policy(HASH_A)), '_headers': headers })

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/_headers/)
  })

  it('a pages/_headers that detaches the policy', () => {
    const p = project({ 'index.html': page(policy(HASH_A)) })
    p.write('pages', { _headers: '/*\n  ! Content-Security-Policy\n' })

    expect(() => assemble(p.options)).toThrow(/pages/)
  })

  it("a _headers file over the platform's 100 rules", () => {
    const rules = Array.from({ length: 100 }, (_, i) => `/p${String(i)}\n  X-A: b\n`).join('')
    const p = project({ 'index.html': page(null), '_headers': rules })

    expect(() => assemble(p.options)).toThrow(/100/)
  })

  it("a _headers line over the platform's 2,000 characters", () => {
    const p = project({ 'index.html': page(null), '_headers': `/*\n  X-A: ${'x'.repeat(2000)}\n` })

    expect(() => assemble(p.options)).toThrow(/2000/)
  })

  // The platform may not let a test create a link (Windows needs a privilege): the case then
  // passes without checking, and says so in its name.
  it.each(['the frontend output', 'pages/'])(
    'a symbolic link in %s (not checked where the platform cannot create one)',
    (where) => {
      const p = project({ 'index.html': page(policy(HASH_A)) })
      const target = path.join(p.root, 'outside.html')
      writeFileSync(target, page(null))
      const folder = where === 'pages/' ? 'pages' : 'out'
      const outside = path.join(p.root, 'outside')
      mkdirSync(outside)
      try {
        symlinkSync(target, path.join(p.root, folder, 'link.html'))
      } catch {
        // Windows without the privilege: a junction is a link too, and needs none.
        try {
          symlinkSync(outside, path.join(p.root, folder, 'linked'), 'junction')
        } catch {
          return
        }
      }
      p.write('dist', { 'previous.html': 'kept' })

      expect(() => assemble(p.options)).toThrow(AssembleError)
      expect(() => assemble(p.options)).toThrow(/symbolic link/)
      expect(p.read('previous.html')).toBe('kept')
    },
  )
})

describe('assemble without a frontend', () => {
  it('writes a dist of the files of pages/ and the fixed policy line', () => {
    const p = project(null)

    const summary = assemble(p.options)

    expect(summary).toMatchObject({ pages: 0, withPolicy: 0, without: [] })
    expect(p.read('_routes.json')).toContain('/api/*')
    expect(p.read('_headers')).toBe(
      `# base\n/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: ${FIXED_POLICY}\n`,
    )
    expect(existsSync(path.join(p.root, 'dist', 'index.html'))).toBe(false)
    expect(p.warnings).toEqual([])
  })
})
