import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mergeGitignore } from '../lib/gitignore'

const sections = [
  { name: 'base', body: '.env\n' },
  { name: 'node', body: 'node_modules/\n' },
]

describe('mergeGitignore', () => {
  test('writes every section into a fresh file', () => {
    const out = mergeGitignore(undefined, sections)
    expect(out).toBe(
      '# --- fullstack-templates: base ---\n.env\n\n# --- fullstack-templates: node ---\nnode_modules/\n',
    )
  })
  test('appends only the sections an existing file lacks, keeping its content', () => {
    const existing = '*.log\n\n# --- fullstack-templates: base ---\n.env\n'
    const out = mergeGitignore(existing, sections)
    expect(out.startsWith('*.log\n')).toBe(true)
    expect(out.match(/fullstack-templates: base/g)).toHaveLength(1)
    expect(out).toContain('# --- fullstack-templates: node ---\nnode_modules/\n')
  })
  test('is idempotent', () => {
    const once = mergeGitignore(undefined, sections)
    expect(mergeGitignore(once, sections)).toBe(once)
  })
})

describe('the cloudflare section', () => {
  const file = path.join(import.meta.dir, '..', '..', 'shared', 'gitignore', 'cloudflare.gitignore')
  const lines = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l !== '')

  test('ignores Wrangler state, the local variables except the example, Astro, the build and the e2e state', () => {
    expect(lines).toEqual([
      '.wrangler/',
      '.dev.vars',
      '.dev.vars.*',
      '!.dev.vars.example',
      '.astro/',
      'dist/',
      '.e2e-state/',
    ])
  })
  test('merges after node once, as gitignore: [node, cloudflare] selects', () => {
    const body = readFileSync(file, 'utf8')
    const merged = mergeGitignore(undefined, [
      { name: 'node', body: 'node_modules/\n' },
      { name: 'cloudflare', body },
    ])
    expect(merged).toContain('# --- fullstack-templates: cloudflare ---\n.wrangler/')
    expect(mergeGitignore(merged, [{ name: 'cloudflare', body }])).toBe(merged)
  })
})
