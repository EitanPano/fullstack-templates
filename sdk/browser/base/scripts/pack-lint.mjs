// publint and are-the-types-wrong, both on the packed tarball: what a consumer installs.
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { pack } from './pack.mjs'

const bin = (name) => `"${join(process.cwd(), 'node_modules', '.bin', name)}"`

const dir = mkdtempSync(join(tmpdir(), 'sdk-pack-'))
try {
  const tarball = pack(process.cwd(), dir)
  execSync(`${bin('publint')} --strict "${tarball}"`, { stdio: 'inherit' })
  execSync(`${bin('attw')} "${tarball}" --profile node16`, { stdio: 'inherit' })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
