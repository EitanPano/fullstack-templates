// Packs the package into a folder and returns the tarball's path: what `npm publish` would send.
import { execSync } from 'node:child_process'
import { join } from 'node:path'

export function pack(root, dest) {
  const out = execSync(`npm pack --json --pack-destination "${dest}"`, {
    cwd: root,
    encoding: 'utf8',
  })
  const [info] = JSON.parse(out)
  return join(dest, info.filename)
}
