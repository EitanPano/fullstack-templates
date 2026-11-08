// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const read = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../src/core/i18n/translations/${name}.json`, import.meta.url)),
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

// The {name} placeholders of a message; an escaped literal such as {'@'} is not one.
const params = (message: string): string[] =>
  [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort()

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

  it('keeps every {param} of an English string in the Hebrew one', () => {
    for (const key of en.keys()) {
      expect(params(text(he, key)), key).toEqual(params(text(en, key)))
    }
  })

  it('has no empty Hebrew string', () => {
    for (const key of he.keys()) expect(text(he, key).trim(), key).not.toBe('')
  })

  it('holds no unescaped message syntax beyond {param} placeholders', () => {
    for (const [key, value] of he) {
      expect(unescapedSyntax(String(value)), key).toBe('')
    }
  })
})

// vue-i18n reads `@`, `|`, `{` and `}` as syntax: a literal one is written {'@'}. What is left of
// a message once the placeholders and the valid escapes are removed holds none of them.
function unescapedSyntax(message: string): string {
  return message
    .replace(/\{\w+\}/g, '')
    .replace(/\{'[@|{}]'\}/g, '')
    .replace(/[^@|{}]/g, '')
}

describe('unescapedSyntax', () => {
  it('accepts a placeholder and each escaped literal', () => {
    expect(unescapedSyntax("mail a{'@'}b {name} {'|'} {'{'} {'}'}")).toBe('')
  })

  it('reports a bare literal', () => {
    expect(unescapedSyntax('a@b')).toBe('@')
    expect(unescapedSyntax('a | b {')).toBe('|{')
  })
})
