// What the build holds, read from dist/ (`bun run test:e2e` builds first): a content page ships no
// script but the theme file, and nothing of server/ or functions/ reaches the browser (V04).
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '@playwright/test'

const DIST = 'dist'

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

const built = files(DIST)
const pages = built.filter((file) => file.endsWith('.html'))

test('the build holds the pages', () => {
  expect(pages.map((page) => path.relative(DIST, page)).sort()).toEqual(['404.html', 'index.html'])
})

test('a content page references no script but the theme file and carries no inline script', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8')
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    expect(
      scripts.map((script) => /src="([^"]*)"/.exec(script[1] ?? '')?.[1] ?? '(inline)'),
      page,
    ).toEqual(['/theme-init.js'])
    expect(
      scripts.every((script) => (script[2] ?? '').trim() === ''),
      page,
    ).toBe(true)
  }
})

test('the pages carry no policy meta: it is in dist/_headers', () => {
  for (const page of pages) {
    expect(readFileSync(page, 'utf8'), page).not.toMatch(/http-equiv="content-security-policy"/i)
  }
  expect(readFileSync(path.join(DIST, '_headers'), 'utf8')).toContain('Content-Security-Policy:')
})

// The names `server/` and `functions/` export that no browser-side file also declares. None may
// appear in a built file: the browser half imports `shared/` only.
function serverOnlyNames(): string[] {
  const own = [...files('server'), ...files('functions')].filter((file) => /\.(ts|js)$/.test(file))
  const shared = [...files('src'), ...files('shared')]
    .filter((file) => /\.(ts|astro)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  const names = own.flatMap((file) =>
    [
      ...readFileSync(file, 'utf8').matchAll(/export (?:async )?(?:const|function|class) (\w+)/g),
    ].map((match) => match[1] as string),
  )
  return [...new Set(names)].filter((name) => name.length >= 8 && !shared.includes(name))
}

test('no text of server/ or functions/ is in the build', () => {
  const names = serverOnlyNames()
  expect(names.length).toBeGreaterThan(10)
  const text = built
    .filter((file) => /\.(html|js|css|map|json|txt)$/.test(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  expect(names.filter((name) => text.includes(name))).toEqual([])
  expect(text).not.toContain('ENCRYPTION_KEY')
})
