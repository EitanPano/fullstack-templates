// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// The browser controls are wrapped once, in shared/components/ (AGENTS.md › Styling): everywhere
// else a template uses the wrapper, never <button>, <input>, <select> or <textarea>. angular-eslint
// has no rule that restricts an element, so this scan reads every template, file or inline.
const src = fileURLToPath(new URL('../../src', import.meta.url))
const HOME = join('app', 'shared', 'components') + sep
const CONTROL = /<(button|input|select|textarea)(?=[\s/>])/g

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.(html|ts)$/.test(entry.name) ? [path] : []
  })
}

// The templates a file holds: an .html file whole, a .ts file's inline `template:` strings.
function templatesIn(file: string, source: string): string[] {
  if (file.endsWith('.html')) return [source]
  return [...source.matchAll(/\btemplate\s*:\s*(`[^`]*`|'[^']*'|"[^"]*")/g)].map((m) => m[1])
}

function controlsIn(template: string): string[] {
  return [...template.matchAll(CONTROL)].map((m) => m[1])
}

describe('restricted elements', () => {
  it('finds the four controls in a template', () => {
    expect(
      controlsIn('<button type="button"></button><input /><select></select><textarea>'),
    ).toEqual(['button', 'input', 'select', 'textarea'])
  })

  it('ignores a wrapper component and a longer tag name', () => {
    expect(controlsIn('<app-button></app-button><buttons></buttons><inputs />')).toEqual([])
  })

  it('reads an inline template', () => {
    const source = 'x = { template: `<input />` }'
    expect(templatesIn('x.component.ts', source).flatMap(controlsIn)).toEqual(['input'])
  })

  it('finds no raw control outside shared/components', () => {
    const offenders = files(src)
      .filter((file) => !file.endsWith('.spec.ts') && !relative(src, file).startsWith(HOME))
      .flatMap((file) =>
        templatesIn(file, readFileSync(file, 'utf8'))
          .flatMap(controlsIn)
          .map((tag) => `${relative(src, file)}: <${tag}>`),
      )
    expect(offenders).toEqual([])
  })
})
