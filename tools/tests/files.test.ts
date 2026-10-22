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
