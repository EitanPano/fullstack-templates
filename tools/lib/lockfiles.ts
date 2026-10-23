import { copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Catalog, LoadedTemplate } from './catalog'
import { CommandError, runCommand } from './commands'
import { removeTree } from './files'

export const LOCKFILE = 'bun.lock'
export const UV_LOCKFILE = 'uv.lock'

// Both checks run in a scratch copy so no node_modules or .venv lands in base/.
function withScratch(check: (scratch: string) => void): void {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'catalog-lock-'))
  try {
    check(scratch)
  } finally {
    removeTree(scratch)
  }
}

// A frozen install fails when the manifest asks for something the lock does not hold, which is
// exactly the drift a contributor creates by editing package.json without installing.
function checkNpm(template: LoadedTemplate, manifestName: string): string | undefined {
  const manifest = path.join(template.dir, 'base', manifestName)
  const lock = path.join(path.dirname(manifest), LOCKFILE)
  if (!existsSync(lock)) {
    return `${template.path}: ${LOCKFILE} is missing next to base/${manifestName}`
  }
  try {
    withScratch((scratch) => {
      copyFileSync(manifest, path.join(scratch, path.basename(manifest)))
      copyFileSync(lock, path.join(scratch, LOCKFILE))
      runCommand('bun install --frozen-lockfile --ignore-scripts', scratch)
    })
  } catch (error) {
    if (!(error instanceof CommandError)) throw error
    return `${template.path}: ${LOCKFILE} is out of date for base/${manifestName}; run bun install in base/ and commit the lock`
  }
  return undefined
}

// `uv lock --check` exits 1 when re-locking would change uv.lock. The interpreter pin travels with
// the copy because uv reads it while resolving.
function checkPyproject(template: LoadedTemplate, manifestName: string): string | undefined {
  const manifest = path.join(template.dir, 'base', manifestName)
  const dir = path.dirname(manifest)
  const lock = path.join(dir, UV_LOCKFILE)
  if (!existsSync(lock)) {
    return `${template.path}: ${UV_LOCKFILE} is missing next to base/${manifestName}`
  }
  try {
    withScratch((scratch) => {
      copyFileSync(manifest, path.join(scratch, path.basename(manifest)))
      copyFileSync(lock, path.join(scratch, UV_LOCKFILE))
      const pin = path.join(dir, '.python-version')
      if (existsSync(pin)) copyFileSync(pin, path.join(scratch, '.python-version'))
      runCommand('uv lock --check', scratch)
    })
  } catch (error) {
    if (!(error instanceof CommandError)) throw error
    // No exit status means uv never ran; calling that "out of date" would send the contributor
    // after the wrong problem.
    if (error.status === null) {
      return `${template.path}: cannot check ${UV_LOCKFILE}, uv is not available on PATH (${error.message})`
    }
    return `${template.path}: ${UV_LOCKFILE} is out of date for base/${manifestName}; run uv lock in base/ and commit the lock`
  }
  return undefined
}

export function checkLockfiles(catalog: Catalog): string[] {
  const problems: string[] = []
  for (const template of catalog.templates.values()) {
    const spec = template.manifest.dependencies
    if (spec === undefined) continue
    const problem =
      spec.adapter === 'npm'
        ? checkNpm(template, spec.manifest)
        : checkPyproject(template, spec.manifest)
    if (problem !== undefined) problems.push(problem)
  }
  return problems
}
