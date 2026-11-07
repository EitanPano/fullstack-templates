// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../src/app/core/i18n/translations/${name}.json`, import.meta.url)),
      'utf8',
    ),
  )

// Every leaf of a copy table by dot path ('notFound.title'); a non-string leaf is reported as such.
function leaves(node: unknown, path = ''): Map<string, unknown> {
  if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
    return new Map(
      Object.entries(node).flatMap(([key, child]) => [
        ...leaves(child, path === '' ? key : `${path}.${key}`),
      ]),
    )
  }
  return new Map([[path, node]])
}

const text = (table: Map<string, unknown>, key: string): string => {
  const value = table.get(key)
  return typeof value === 'string' ? value : ''
}

const params = (text: string): string[] =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort()

describe('translation parity', () => {
  const en = leaves(read('en'))
  const he = leaves(read('he'))

  it('has strings at every leaf', () => {
    for (const table of [en, he]) {
      for (const [key, value] of table) expect(typeof value, key).toBe('string')
    }
  })

  it('gives he.json exactly the keys of en.json', () => {
    const missing = [...en.keys()].filter((key) => !he.has(key))
    const extra = [...he.keys()].filter((key) => !en.has(key))
    expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    expect(en.size).toBeGreaterThan(0)
  })

  it('keeps every {{param}} of an English string in the Hebrew one', () => {
    for (const key of en.keys()) {
      expect(params(text(he, key)), key).toEqual(params(text(en, key)))
    }
  })

  it('has no empty Hebrew string', () => {
    for (const key of he.keys()) expect(text(he, key).trim(), key).not.toBe('')
  })
})
