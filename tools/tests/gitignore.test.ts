import { describe, expect, test } from 'bun:test'
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
