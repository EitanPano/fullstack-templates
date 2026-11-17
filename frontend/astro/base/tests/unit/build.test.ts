// What a build holds, read from a real `astro build` into a throwaway folder (so `bun run check`
// needs no earlier build and never touches dist/): the index page and the 404 page reference no
// script but the theme file and carry the hashed policy, the host files pass through, and nothing
// of the server package reaches the browser.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const astroBin = path.resolve('node_modules/astro/bin/astro.mjs')
const out = mkdtempSync(path.join(tmpdir(), 'astro-build-'))

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

let built: string[] = []
beforeAll(() => {
  const run = spawnSync(process.execPath, [astroBin, 'build', '--outDir', out], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', FORCE_COLOR: '0' },
    timeout: 170_000,
  })
  if (run.status !== 0) throw new Error(`astro build failed:\n${run.stdout}\n${run.stderr}`)
  built = files(out)
}, 180_000)
afterAll(() => {
  rmSync(out, { recursive: true, force: true })
})

const read = (name: string) => readFileSync(path.join(out, name), 'utf8')
const PAGES = ['index.html', '404.html']

describe('the built pages', () => {
  it('has the index page and the 404 page at the root (build.format: file)', () => {
    const pages = built.filter((file) => file.endsWith('.html')).map((f) => path.relative(out, f))
    for (const page of PAGES) expect(pages).toContain(page)
  })

  it.each(PAGES)('%s references no script but the theme file and has no inline script', (page) => {
    const scripts = [...read(page).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(
      scripts.map((script) => /src="([^"]*)"/.exec(script[1] ?? '')?.[1] ?? '(inline)'),
    ).toEqual(['/theme-init.js'])
    expect(scripts.every((script) => (script[2] ?? '').trim() === '')).toBe(true)
  })

  it.each(PAGES)('%s carries a whole policy, hashed, with no unsafe-inline', (page) => {
    const meta = /<meta[^>]*http-equiv="content-security-policy"[^>]*content="([^"]*)"/i.exec(
      read(page),
    )
    const policy = meta?.[1] ?? ''
    expect(policy).toMatch(/script-src 'self' 'sha256-/)
    expect(policy).toMatch(/style-src 'self'/)
    for (const directive of [
      "default-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(policy).toContain(directive)
    }
    // A meta cannot carry frame-ancestors; a browser would log it as ignored.
    expect(policy).not.toContain('frame-ancestors')
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it('passes the theme script, the favicon and the host headers through public/', () => {
    expect(built.map((f) => path.relative(out, f))).toEqual(
      expect.arrayContaining(['theme-init.js', 'favicon.svg', '_headers']),
    )
    expect(read('_headers')).toContain('/_astro/*')
    expect(read('_headers')).not.toMatch(/^\s*content-security-policy\s*:/im)
  })
})

// @server-start
// The names `server/` and `functions/` of the API package export that no file of this package also
// declares. None may appear in a built file: the browser half reaches the API through /api only.
describe('the server package stays out of the build', () => {
  const server = path.resolve('..', '__SERVER_DIR__')
  const own = [...files(path.join(server, 'server')), ...files(path.join(server, 'functions'))]
    .filter((file) => /\.(ts|js)$/.test(file))
    .flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(/export (?:async )?(?:const|function|class) (\w+)/g),
      ].map((match) => match[1] as string),
    )
  const ours = [...files('src'), ...files('tests')]
    .filter((file) => /\.(ts|astro)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  const names = [...new Set(own)].filter((name) => name.length >= 8 && !ours.includes(name))

  it('has names to look for', () => {
    expect(names.length).toBeGreaterThan(10)
  })

  it('writes none of them into a built file', () => {
    const text = built
      .filter((file) => /\.(html|js|css|map|json|txt)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(names.filter((name) => text.includes(name))).toEqual([])
  })
})
// @server-end
