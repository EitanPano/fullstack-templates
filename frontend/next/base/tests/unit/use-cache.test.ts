import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// The plan's mitigation for R-cache: the build fails when a cached function reads cookies or
// headers, but `check` does not build, so this catches it earlier. A directive line only; a
// comment that mentions 'use cache' is not one. The template ships no cached loader, so the rule
// is proved on seeded sources and then applied to every file of the real `src`.
const SRC = path.resolve(__dirname, '../../src')
const DIRECTIVE = /^\s*['"]use cache(?::\s*\w+)?['"]/m
const FORBIDDEN = [
  { name: 'next/headers', test: /from\s+['"]next\/headers['"]/ },
  { name: '@/shared/auth/*', test: /from\s+['"]@\/shared\/auth\// },
  { name: 'createRequestApi', test: /\bcreateRequestApi\b/ },
]

// The forbidden imports a source holds, or null when it is not a cached file.
function forbiddenIn(source: string): string[] | null {
  if (!DIRECTIVE.test(source)) return null
  return FORBIDDEN.filter((rule) => rule.test.test(source)).map((rule) => rule.name)
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sources(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe("the 'use cache' rule on seeded sources", () => {
  it.each([
    ['next/headers', "import { cookies } from 'next/headers'"],
    ['@/shared/auth/*', "import { requireAccount } from '@/shared/auth/session'"],
    ['createRequestApi', 'const api = await createRequestApi()'],
  ])('refuses a cached file that uses %s', (name, line) => {
    expect(forbiddenIn(`'use cache'\n${line}\n`)).toEqual([name])
  })

  it('allows a cached file that calls the API with the plain client', () => {
    const source =
      "'use cache: remote'\nimport { createApi } from '@/shared/api/client'\ncreateApi()\n"

    expect(forbiddenIn(source)).toEqual([])
  })

  it('skips a file without the directive, whatever it imports', () => {
    expect(forbiddenIn("import { cookies } from 'next/headers'\n")).toBeNull()
    expect(
      forbiddenIn("// a 'use cache' comment is not the directive\nconst x = createRequestApi()\n"),
    ).toBeNull()
  })
})

describe("the 'use cache' files of src", () => {
  it('read no cookies, headers or session', () => {
    const files = sources(SRC)
    const offenders = files.flatMap((file) => {
      const found = forbiddenIn(readFileSync(file, 'utf8'))
      return found?.length ? [`${path.relative(SRC, file)}: ${found.join(', ')}`] : []
    })

    expect(files.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})
