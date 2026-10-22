import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DependencyError, applyDependencyChange } from '../lib/dependencies'

function pkg(content: object): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'deps-'))
  const file = path.join(dir, 'package.json')
  writeFileSync(file, JSON.stringify(content, null, 2))
  return file
}

describe('npm adapter', () => {
  test('removes from dependencies and devDependencies', () => {
    const file = pkg({
      dependencies: { jose: '^6', express: '^5' },
      devDependencies: { '@types/cookie-parser': '^1' },
    })
    applyDependencyChange(file, 'npm', { remove: ['jose', '@types/cookie-parser'] }, 'auth')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      dependencies: { express: '^5' },
      devDependencies: {},
    })
  })
  test('throws when a package to remove is absent', () => {
    const file = pkg({ dependencies: {} })
    expect(() => applyDependencyChange(file, 'npm', { remove: ['jose'] }, 'auth')).toThrow(
      DependencyError,
    )
    expect(() => applyDependencyChange(file, 'npm', { remove: ['jose'] }, 'auth')).toThrow('jose')
  })
  test('adds and sorts', () => {
    const file = pkg({ dependencies: { zod: '^4' } })
    applyDependencyChange(
      file,
      'npm',
      { add: { dependencies: { express: '^5' }, devDependencies: { typescript: '^5' } } },
      'db',
    )
    const out = readFileSync(file, 'utf8')
    expect(Object.keys(JSON.parse(out).dependencies)).toEqual(['express', 'zod'])
    expect(out.endsWith('\n')).toBe(true)
  })
  test('removes a package listed in both maps from both', () => {
    const file = pkg({ dependencies: { a: '1' }, devDependencies: { a: '1', b: '2' } })
    applyDependencyChange(file, 'npm', { remove: ['a'] }, 'x')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      dependencies: {},
      devDependencies: { b: '2' },
    })
  })
  test('wraps invalid JSON in DependencyError naming the path', () => {
    const file = pkg({})
    writeFileSync(file, '{ not json')
    expect(() => applyDependencyChange(file, 'npm', { remove: ['a'] }, 'auth')).toThrow(
      DependencyError,
    )
    expect(() => applyDependencyChange(file, 'npm', { remove: ['a'] }, 'auth')).toThrow(file)
  })
  test('add creates an absent devDependencies map', () => {
    const file = pkg({ dependencies: { a: '1' } })
    applyDependencyChange(file, 'npm', { add: { devDependencies: { t: '5' } } }, 'db')
    expect(JSON.parse(readFileSync(file, 'utf8')).devDependencies).toEqual({ t: '5' })
  })
  test('preserves unrelated keys and their order', () => {
    const file = pkg({ name: 'n', scripts: { dev: 'x' }, dependencies: { a: '1' }, private: true })
    applyDependencyChange(file, 'npm', { add: { dependencies: { b: '2' } } }, 'db')
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual([
      'name',
      'scripts',
      'dependencies',
      'private',
    ])
  })
})
