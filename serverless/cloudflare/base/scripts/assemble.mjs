// assemble belongs: `bun run assemble`, building dist/ from the frontend's build output and pages/.
// The frontend's output directory is fixed at generation (or given as --frontend <dir>); a package
// generated without a frontend gets a dist/ of pages/'s files alone. `--out <dir>` builds somewhere
// other than dist/. Relative paths are relative to the package root. Run it after the frontend's
// build: it never builds anything itself.
// It does not belong: the logic (lib/assemble.mjs) or serving (start.mjs).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AssembleError, assemble } from './lib/assemble.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontendOut = '__FRONTEND_PATH__/__FRONTEND_OUT__' // @frontend
const frontendOut = null // @nofrontend

const option = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}
const chosen = option('--frontend') ?? frontendOut
const out = option('--out') ?? 'dist'

try {
  const summary = assemble({
    pages: path.join(root, 'pages'),
    dist: path.resolve(root, out),
    frontend: chosen === null ? null : path.resolve(root, chosen),
  })
  console.log(
    `assemble: dist/ built from ${chosen ?? 'pages/ alone'} (${String(summary.pages)} pages, ${String(summary.withPolicy)} with a policy)`,
  )
} catch (error) {
  console.error(`assemble: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(error instanceof AssembleError ? 1 : 2)
}
