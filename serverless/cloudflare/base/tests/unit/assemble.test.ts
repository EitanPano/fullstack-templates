// The assemble step on fixture output directories: what lands in dist/, how static/ is laid over a
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

import { AssembleError, assemble, frontendOverrides } from '../../scripts/lib/assemble.mjs'
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

// A scratch project: static/ as the template ships it, an optional frontend output, an empty dist.
function project(frontend: Record<string, string> | null) {
  const root = mkdtempSync(path.join(tmpdir(), 'assemble-'))
  roots.push(root)
  const write = (base: string, files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, base, name)), { recursive: true })
      writeFileSync(path.join(root, base, name), text)
    }
  }
  write('static', {
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
      statics: path.join(root, 'static'),
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

  it('copies the output, lays static/ over it and merges _headers, the frontend first', () => {
    const p = project(output)

    assemble(p.options)

    expect(p.read('_astro/app.js')).toBe('console.log(1)')
    const headers = p.read('_headers')
    expect(headers.indexOf('/_astro/*')).toBeGreaterThanOrEqual(0)
    expect(headers.indexOf('/_astro/*')).toBeLessThan(headers.indexOf('X-Content-Type-Options'))
  })

  it('lets a file of static/ replace the frontend’s and writes no Pages routing file', () => {
    const p = project({ ...output, 'robots.txt': 'theirs' })
    p.write('static', { 'robots.txt': 'ours' })

    assemble(p.options)

    expect(p.read('robots.txt')).toBe('ours')
    expect(existsSync(path.join(p.root, 'dist', '_routes.json'))).toBe(false)
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

  it('a static/_headers that detaches the policy', () => {
    const p = project({ 'index.html': page(policy(HASH_A)) })
    p.write('static', { _headers: '/*\n  ! Content-Security-Policy\n' })

    expect(() => assemble(p.options)).toThrow(/static/)
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
  it.each(['the frontend output', 'static/'])(
    'a symbolic link in %s (not checked where the platform cannot create one)',
    (where) => {
      const p = project({ 'index.html': page(policy(HASH_A)) })
      const target = path.join(p.root, 'outside.html')
      writeFileSync(target, page(null))
      const folder = where === 'static/' ? 'static' : 'out'
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

// Several frontends: a scratch project with static/ and one build folder per frontend.
function several(builds: Record<string, Record<string, string>>) {
  const p = project(null)
  const frontends = Object.entries(builds).map(([dir, build]) => {
    for (const [name, text] of Object.entries(build)) {
      mkdirSync(path.dirname(path.join(p.root, `out-${dir}`, name)), { recursive: true })
      writeFileSync(path.join(p.root, `out-${dir}`, name), text)
    }
    return { dir, build: path.join(p.root, `out-${dir}`) }
  })
  return { ...p, frontends, options: { ...p.options, frontend: null, frontends } }
}

describe('assemble with several frontends', () => {
  const site = {
    'index.html': page(policy(HASH_A)),
    '404.html': page(policy(HASH_A)),
    '_astro/app.js': 'console.log(1)',
    '_headers': '/*\n  X-Site: yes\n/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n',
    '_redirects': '# moved\n/old /new 301\n/blog/* /news/:splat 302\n/away https://example.com/x 301\n',
  }
  const admin = { 'index.html': page(policy(HASH_B)), 'nested/_headers': 'a page, not a rule' }
  const both = () => several({ site, admin })

  it('puts each build in a folder of its own and none at the root', () => {
    const p = both()

    assemble(p.options)

    expect(p.read('site/index.html')).toBe(site['index.html'])
    expect(p.read('site/_astro/app.js')).toBe('console.log(1)')
    expect(p.read('admin/index.html')).toBe(admin['index.html'])
    expect(existsSync(path.join(p.root, 'dist', 'index.html'))).toBe(false)
    expect(existsSync(path.join(p.root, 'dist', '_astro'))).toBe(false)
  })

  it('never copies a build’s _headers or _redirects into its folder, where they would be served as text', () => {
    const p = both()

    assemble(p.options)

    for (const name of ['_headers', '_redirects']) {
      expect(existsSync(path.join(p.root, 'dist', 'site', name))).toBe(false)
    }
    expect(existsSync(path.join(p.root, 'dist', '_headers'))).toBe(true)
    expect(existsSync(path.join(p.root, 'dist', '_redirects'))).toBe(true)
  })

  it('merges each build’s _headers into the root file with its folder in front of every rule', () => {
    const p = both()

    assemble(p.options)

    const lines = p.read('_headers').split('\n')
    expect(lines).toContain('/site/*')
    expect(lines).toContain('/site/_astro/*')
    expect(lines).not.toContain('/_astro/*')
    // The base rules of static/ stay as they are, after the builds' own.
    expect(lines.indexOf('/*')).toBeGreaterThan(lines.indexOf('/site/_astro/*'))
    expect(lines).toContain('  X-Content-Type-Options: nosniff')
    expect(lines).toContain('  X-Site: yes')
  })

  it('merges each build’s _redirects with the folder in front of the source and a path destination', () => {
    const p = both()

    assemble(p.options)

    const lines = p.read('_redirects').split('\n')
    expect(lines).toContain('/site/old /site/new 301')
    expect(lines).toContain('/site/blog/* /site/news/:splat 302')
    expect(lines).toContain('/site/away https://example.com/x 301')
    expect(lines).toContain('# moved')
    expect(lines).toContain('# none')
  })

  it('writes the fixed policy line once per folder, under that folder’s rule and not under /*', () => {
    const p = both()

    const summary = assemble(p.options)

    const lines = p.read('_headers').split('\n')
    const policyAt = lines.flatMap((l, at) => (l.includes('Content-Security-Policy') ? [at] : []))
    expect(policyAt).toHaveLength(2)
    const ruleOf = (at: number) => lines.slice(0, at).findLast((l) => /^\S/.test(l) && l !== '')
    expect(policyAt.map(ruleOf).sort()).toEqual(['/admin/*', '/site/*'])
    expect(lines[policyAt[0] ?? 0]).toBe(`  Content-Security-Policy: ${FIXED_POLICY}`)
    expect(summary).toMatchObject({ pages: 3, withPolicy: 3, without: [] })
  })

  it('checks every folder’s pages and names the frontend that broke the policy', () => {
    const bad = {
      'index.html': page(policy(HASH_A)),
      'x/y.html': page("script-src 'self' 'unsafe-inline'; style-src 'self';"),
    }
    const p = several({ site, admin: bad })
    p.write('dist', { 'previous.html': 'kept' })

    expect(() => assemble(p.options)).toThrow(/frontend "admin".*x\/y\.html/)
    expect(p.read('previous.html')).toBe('kept')
    expect(existsSync(`${p.options.dist}.assembling`)).toBe(false)
  })

  it('warns once, naming the folder of each page that has no policy meta', () => {
    const p = several({ site: { 'index.html': page(null) }, admin })

    const summary = assemble(p.options)

    expect(summary.without).toEqual(['site/index.html'])
    expect(p.warnings).toHaveLength(1)
    expect(p.warnings[0]).toContain('site/index.html')
  })

  it('fails naming the frontend whose build is missing or empty, and keeps the previous dist', () => {
    const p = both()
    rmSync(path.join(p.root, 'out-admin'), { recursive: true })
    p.write('dist', { 'previous.html': 'kept' })

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/frontend "admin".*missing or empty/)
    expect(p.read('previous.html')).toBe('kept')

    mkdirSync(path.join(p.root, 'out-admin'))
    expect(() => assemble(p.options)).toThrow(/frontend "admin".*missing or empty/)
  })

  it('with only, assembles that one frontend alone and ignores the other’s missing build', () => {
    const p = both()
    rmSync(path.join(p.root, 'out-site'), { recursive: true })

    assemble({ ...p.options, only: 'admin' })

    expect(p.read('admin/index.html')).toBe(admin['index.html'])
    expect(existsSync(path.join(p.root, 'dist', 'site'))).toBe(false)
    const lines = p.read('_headers').split('\n')
    expect(lines.filter((l) => l.includes('Content-Security-Policy'))).toHaveLength(1)
    expect(lines).toContain('/admin/*')
    expect(lines).not.toContain('/site/*')
  })

  it('reads --frontend <dir>=<output dir> pairs and refuses a value that is no pair or names no frontend', () => {
    const names = ['site', 'admin']
    const argv = ['--out', 'x', '--frontend', 'admin=build/admin', '--frontend', 'site=o=k']
    expect(frontendOverrides(argv, names)).toEqual(
      new Map([
        ['admin', 'build/admin'],
        ['site', 'o=k'],
      ]),
    )
    expect(() => frontendOverrides(['--frontend', 'build/admin'], names)).toThrow(AssembleError)
    expect(() => frontendOverrides(['--frontend', 'build/admin'], names)).toThrow(/<dir>=<output dir>/)
    expect(() => frontendOverrides(['--frontend', 'nope=build'], names)).toThrow(
      /"nope".*not a frontend \(site, admin\)/,
    )
    expect(() => frontendOverrides(['--frontend'], names)).toThrow(AssembleError)
    expect(frontendOverrides([], names).size).toBe(0)
  })

  it('refuses an only that is not one of the frontends', () => {
    const p = both()

    expect(() => assemble({ ...p.options, only: 'nope' })).toThrow(/--only names "nope".*site, admin/)
  })

  it.each([
    ['sets the policy', 'x', '/*\n  Content-Security-Policy: default-src *\n', /_headers of frontend "admin"/],
    ['holds a host rule', 'x', 'https://:project.pages.dev/*\n  X: y\n', /rule "https:.*must be a path/],
  ])('refuses a build whose _headers %s', (_what, _x, headers, message) => {
    const p = several({ site, admin: { 'index.html': page(null), '_headers': headers } })

    expect(() => assemble(p.options)).toThrow(message)
  })

  it.each([
    ['a source that is not a path', 'old /new 301\n', /source "old" must be a path/],
    ['a destination that is neither', '/old new 301\n', /destination "new" must be a path/],
    ['a redirect with no destination', '/old\n', /has no destination/],
  ])('refuses a build whose _redirects hold %s', (_what, redirects, message) => {
    const p = several({
      site: { 'index.html': page(null), '_redirects': redirects },
      admin,
    })

    expect(() => assemble(p.options)).toThrow(message)
  })

  it('refuses a frontend directory that is not one lower-case name', () => {
    const p = several({ 'a/b': site })

    expect(() => assemble(p.options)).toThrow(/"a\/b" is not one lower-case name/)
  })

  it('replaces a previous dist, and a frontend with no _headers still gets a policy rule', () => {
    const p = several({ site: { 'index.html': page(policy(HASH_A)) }, admin })
    p.write('dist', { 'stale.html': 'old' })

    assemble(p.options)

    expect(existsSync(path.join(p.root, 'dist', 'stale.html'))).toBe(false)
    expect(p.read('_headers')).toContain('/site/*\n  Content-Security-Policy')
  })

  it('refuses a symbolic link in a build (not checked where the platform cannot create one)', () => {
    const p = both()
    const target = path.join(p.root, 'outside.html')
    writeFileSync(target, page(null))
    try {
      symlinkSync(target, path.join(p.root, 'out-admin', 'link.html'))
    } catch {
      try {
        symlinkSync(path.join(p.root, 'out-site'), path.join(p.root, 'out-admin', 'linked'), 'junction')
      } catch {
        return
      }
    }

    expect(() => assemble(p.options)).toThrow(/symbolic link/)
  })
})

describe('assemble without a frontend', () => {
  it('writes a dist of the files of static/ and the fixed policy line', () => {
    const p = project(null)

    const summary = assemble(p.options)

    expect(summary).toMatchObject({ pages: 0, withPolicy: 0, without: [] })
    expect(p.read('_headers')).toBe(
      `# base\n/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: ${FIXED_POLICY}\n`,
    )
    expect(existsSync(path.join(p.root, 'dist', 'index.html'))).toBe(false)
    expect(p.warnings).toEqual([])
  })
})
