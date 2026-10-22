import { cpSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const FIXTURE = path.join(import.meta.dir, 'fixtures', 'catalog')

export function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'catalog-test-'))
}

export function copyFixture(name: string): string {
  const dest = tempDir()
  cpSync(path.join(import.meta.dir, 'fixtures', name), dest, { recursive: true })
  return dest
}
