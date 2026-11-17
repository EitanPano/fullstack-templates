// The assemble step on fixture output directories: what lands in dist/, how pages/ is laid over a
// frontend's files, and what makes it refuse.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AssembleError, assemble } from '../../scripts/lib/assemble.mjs'

const HASH_A = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const HASH_B = "'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='"
const STYLE = "'sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='"
const policy = (script: string) => `script-src 'self' ${script}; style-src 'self' ${STYLE};`
const page = (content: string | null) =>
  `<!doctype html><html><head>${
    content === null
      ? ''
      : `<meta http-equiv="content-security-policy" content="${content}">`
  }<title>t</title></head><body><h1>t</h1></body></html>`

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
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
  return {
    root,
    write,
    options: {
      pages: path.join(root, 'pages'),
      dist: path.join(root, 'dist'),
      frontend: frontend === null ? null : path.join(root, 'out'),
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

  it('lifts the pages policies into one header line with the full directive set', () => {
    const p = project(output)

    const summary = assemble(p.options)

    const lines = p.read('_headers').split('\n').filter((l) => l.includes('Content-Security-Policy'))
    expect(lines).toHaveLength(1)
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      HASH_A,
      HASH_B,
      STYLE,
    ]) {
      expect(lines[0]).toContain(directive)
    }
    expect(lines[0]).not.toContain('unsafe-inline')
    expect(summary).toMatchObject({ pages: 3, lifted: 2 })
  })

  it('removes the meta from the pages that had one and leaves the page without one alone', () => {
    const p = project(output)

    assemble(p.options)

    expect(p.read('index.html')).not.toContain('content-security-policy')
    expect(p.read('index.html')).toContain('<h1>t</h1>')
    expect(p.read('404.html')).toBe(page(null))
  })

  it('lets the frontend have no _headers or _redirects of its own', () => {
    const p = project({ 'index.html': page(policy(HASH_A)) })

    assemble(p.options)

    expect(p.read('_redirects')).toBe('# none\n')
    expect(p.read('_headers')).toContain('Content-Security-Policy')
  })

  it('writes no policy line when no page carries one', () => {
    const p = project({ 'index.html': page(null) })

    expect(assemble(p.options)).toMatchObject({ lifted: 0, policy: null })
    expect(p.read('_headers')).not.toContain('Content-Security-Policy')
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

  it('pages whose policies cannot be merged, and keeps the previous dist', () => {
    const p = project({
      'index.html': page(policy(HASH_A)),
      'other.html': page("script-src 'self' 'strict-dynamic'; style-src 'self';"),
    })
    p.write('dist', { 'previous.html': 'kept' })

    expect(() => assemble(p.options)).toThrow(/cannot be merged|different/)
    expect(p.read('previous.html')).toBe('kept')
    expect(existsSync(`${p.options.dist}.assembling`)).toBe(false)
  })

  it('a frontend that already sets a Content-Security-Policy header', () => {
    const p = project({
      'index.html': page(policy(HASH_A)),
      '_headers': '/*\n  Content-Security-Policy: default-src *\n',
    })

    expect(() => assemble(p.options)).toThrow(/already sets Content-Security-Policy/)
  })

  it("a policy line over the platform's 2,000 characters", () => {
    const hashes = Array.from({ length: 60 }, (_, i) => `'sha256-${String(i).padStart(43, 'x')}='`)
    const p = project({ 'index.html': page(policy(hashes.join(' '))) })

    expect(() => assemble(p.options)).toThrow(/2000/)
  })

  it("a _headers file over the platform's 100 rules", () => {
    const rules = Array.from({ length: 100 }, (_, i) => `/p${String(i)}\n  X-A: b\n`).join('')
    const p = project({ 'index.html': page(null), '_headers': rules })

    expect(() => assemble(p.options)).toThrow(/100/)
  })
})

describe('assemble without a frontend', () => {
  it('writes a dist of the files of pages/ alone', () => {
    const p = project(null)

    const summary = assemble(p.options)

    expect(summary).toMatchObject({ pages: 0, policy: null })
    expect(p.read('_routes.json')).toContain('/api/*')
    expect(p.read('_headers')).toBe('# base\n/*\n  X-Content-Type-Options: nosniff\n')
    expect(existsSync(path.join(p.root, 'dist', 'index.html'))).toBe(false)
  })
})
