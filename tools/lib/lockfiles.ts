import { copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Catalog } from './catalog'
import { CommandError, runCommand } from './commands'
import { removeTree } from './files'

export const LOCKFILE = 'bun.lock'

// A frozen install fails when the manifest asks for something the lock does not hold, which is
// exactly the drift a contributor creates by editing package.json without installing. The check
// runs in a scratch copy so no node_modules lands in base/.
export function checkLockfiles(catalog: Catalog): string[] {
  const problems: string[] = []
  for (const template of catalog.templates.values()) {
    const spec = template.manifest.dependencies
    if (spec === undefined || spec.adapter !== 'npm') continue
    const manifest = path.join(template.dir, 'base', spec.manifest)
    const lock = path.join(path.dirname(manifest), LOCKFILE)
    if (!existsSync(lock)) {
      problems.push(`${template.path}: ${LOCKFILE} is missing next to base/${spec.manifest}`)
      continue
    }
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'catalog-lock-'))
    try {
      copyFileSync(manifest, path.join(scratch, path.basename(manifest)))
      copyFileSync(lock, path.join(scratch, LOCKFILE))
      runCommand('bun install --frozen-lockfile --ignore-scripts', scratch)
    } catch (error) {
      if (!(error instanceof CommandError)) throw error
      problems.push(
        `${template.path}: ${LOCKFILE} is out of date for base/${spec.manifest}; run bun install in base/ and commit the lock`,
      )
    } finally {
      removeTree(scratch)
    }
  }
  return problems
}
