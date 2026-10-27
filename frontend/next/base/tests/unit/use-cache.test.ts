import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// The plan's mitigation for R-cache: the build fails when a cached function reads cookies or
// headers, but `check` does not build, so this catches it earlier. A directive line only; a
// comment that mentions 'use cache' is not one.
const SRC = path.resolve(__dirname, '../../src')
const DIRECTIVE = /^\s*['"]use cache(?::\s*\w+)?['"]/m
const FORBIDDEN = [
  { name: 'next/headers', test: /from\s+['"]next\/headers['"]/ },
  { name: '@/shared/auth/*', test: /from\s+['"]@\/shared\/auth\// },
  { name: 'createRequestApi', test: /\bcreateRequestApi\b/ },
]

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const cached = sources(SRC).filter((file) => DIRECTIVE.test(readFileSync(file, 'utf8')))

describe("'use cache' files", () => {
  it('finds the cached loaders', () => {
    expect(cached.length).toBeGreaterThan(0)
  })

  it.each(cached.map((file) => [path.relative(SRC, file), file]))(
    '%s reads no cookies, headers or session',
    (_name, file) => {
      const text = readFileSync(file, 'utf8')
      const found = FORBIDDEN.filter((rule) => rule.test.test(text)).map((rule) => rule.name)

      expect(found).toEqual([])
    },
  )
})
