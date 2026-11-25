// Three consumers of the packed tarball, installed into a folder of their own: an ES module, a
// CommonJS file, and an import with no `window`. What a build tool resolves is not what a
// published package resolves, so this runs against the tarball and never the source.
import { execFileSync, execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { pack } from './pack.mjs'

const root = process.cwd()
const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name
const dir = mkdtempSync(join(tmpdir(), 'sdk-consumers-'))
try {
  const tarball = pack(root, dir)
  const app = join(dir, 'app')
  mkdirSync(app)
  writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  execSync(`npm install --no-audit --no-fund "${tarball}"`, { cwd: app, stdio: 'inherit' })
  for (const file of ['esm.mjs', 'cjs.cjs', 'no-dom.mjs']) {
    copyFileSync(join(root, 'tests', 'consumers', file), join(app, file))
    execFileSync(process.execPath, [file], {
      cwd: app,
      stdio: 'inherit',
      env: { ...process.env, SDK_PACKAGE: name },
    })
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
