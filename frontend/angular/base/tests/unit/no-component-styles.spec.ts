// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// Styles live in src/styles/ only (AGENTS.md › Styling). A component decorator that carries
// `styles`, `styleUrl` or `styleUrls` would put CSS beside the component, so the scan refuses it.
// The line regex is a heuristic: it also flags a non-component `styles:` key and misses a key
// split across lines.
const src = fileURLToPath(new URL('../../src', import.meta.url))

function typescriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return typescriptFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const STYLE_KEYS = /\b(styles|styleUrls?)\s*:/

function stylesIn(source: string): string[] {
  return source.split('\n').filter((line) => STYLE_KEYS.test(line))
}

describe('component styles', () => {
  it('flags a decorator that carries styles', () => {
    expect(
      stylesIn("@Component({ selector: 'app-x', styles: ['p { color: red }'] })"),
    ).toHaveLength(1)
    expect(stylesIn("@Component({ selector: 'app-x', styleUrl: './x.scss' })")).toHaveLength(1)
    expect(stylesIn("@Component({ selector: 'app-x', styleUrls: ['./x.scss'] })")).toHaveLength(1)
  })

  it('accepts a decorator that carries a template only', () => {
    expect(
      stylesIn("@Component({ selector: 'app-x', templateUrl: './x.component.html' })"),
    ).toEqual([])
  })

  it('finds no component in src/ with styles', () => {
    const offenders = typescriptFiles(src).flatMap((file) =>
      stylesIn(readFileSync(file, 'utf8')).map((line) => `${relative(src, file)}: ${line.trim()}`),
    )
    expect(offenders).toEqual([])
  })
})
