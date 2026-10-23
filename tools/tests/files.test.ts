import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { copyTree, listFiles } from '../lib/files'
import { tempDir } from './helpers'

function put(root: string, rel: string): void {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, 'x')
}

describe('copyTree', () => {
  test('skips local state at every depth and keeps the env example', () => {
    const from = tempDir()
    const to = path.join(tempDir(), 'out')
    for (const rel of [
      'node_modules/x',
      'sub/node_modules/x',
      '.next/y',
      '.env',
      'sub/.env.local',
      '.env.example',
      'a.tsbuildinfo',
      'next-env.d.ts',
      '.DS_Store',
      'sub/Thumbs.db',
      'dist/z',
      'src/ok.ts',
    ]) {
      put(from, rel)
    }
    copyTree(from, to)
    const copied = listFiles(to)
      .map((file) => path.relative(to, file).split(path.sep).join('/'))
      .sort()
    expect(copied).toEqual(['.env.example', 'src/ok.ts'])
  })
})

describe('Python local state', () => {
  const state = [
    '.venv/pyvenv.cfg',
    'src/__pycache__/a.pyc',
    '.ruff_cache/x',
    '.mypy_cache/x',
    '.pytest_cache/x',
    '.import_linter_cache/x',
    'foo.egg-info/PKG-INFO',
    'sub/foo.egg-info/PKG-INFO',
    '.env',
  ]
  const rels = (dir: string) =>
    listFiles(dir)
      .map((file) => path.relative(dir, file).split(path.sep).join('/'))
      .sort()

  test('is neither listed nor copied; the env example is kept and the env file is not', () => {
    const from = tempDir()
    for (const rel of [...state, '.env.example', 'src/app.py', 'pyproject.toml']) put(from, rel)
    const expected = ['.env.example', 'pyproject.toml', 'src/app.py']
    expect(rels(from)).toEqual(expected)
    const to = path.join(tempDir(), 'out')
    copyTree(from, to)
    expect(rels(to)).toEqual(expected)
  })

  test('a file that merely looks like a cache directory is kept', () => {
    const from = tempDir()
    put(from, 'notes.egg-info.txt')
    put(from, 'venv/x')
    expect(rels(from)).toEqual(['notes.egg-info.txt', 'venv/x'])
  })
})
