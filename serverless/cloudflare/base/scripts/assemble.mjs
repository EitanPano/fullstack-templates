// assemble belongs: `bun run assemble`, building dist/ from the frontend's build output and static/.
// The frontend's output directory is fixed at generation (or given as --frontend <dir>); a package
// generated without a frontend gets a dist/ of static/'s files alone. `--out <dir>` builds somewhere
// other than dist/. Relative paths are relative to the package root. Run it after the frontend's
// build: it never builds anything itself.
// @frontends-start
// With several frontends each build goes to dist/<dir>/ and `--only <dir>` assembles one frontend
// alone (a frontend's own e2e builds only itself). `--frontend <dir>=<output dir>` (repeatable)
// replaces where one frontend's build is read from.
// @frontends-end
// It does not belong: the logic (lib/assemble.mjs) or serving (start.mjs).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { AssembleError, assemble } from './lib/assemble.mjs'
import { frontendOverrides } from './lib/assemble.mjs' // @frontends

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// @nofrontends-start
const frontendOut = '__FRONTEND_PATH__/__FRONTEND_OUT__' // @frontend
const frontendOut = null // @nofrontend
// @nofrontends-end
// @frontends-start
const frontends = JSON.parse('__FRONTENDS__')
// @frontends-end

const option = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}
// @nofrontends-start
const chosen = option('--frontend') ?? frontendOut
// @nofrontends-end
const out = option('--out') ?? 'dist'
// @sdk-start
// The SDK's build, put under api/sdk/ beside the site. `SDK_DIR` names another one (a test, an e2e
// run); a blank value is unset.
const sdkBuild = process.env.SDK_DIR?.trim() || '__SDK_PATH__/__SDK_OUT__'
// A missing SDK build fails, as a missing frontend build does; `start` and a local run pass the flag.
const allowMissingSdk = process.argv.includes('--allow-missing-sdk')
// @sdk-end

try {
  // @nofrontends-start
  const summary = assemble({
    statics: path.join(root, 'static'),
    dist: path.resolve(root, out),
    frontend: chosen === null ? null : path.resolve(root, chosen),
    sdk: path.resolve(root, sdkBuild), // @sdk
    allowMissingSdk, // @sdk
  })
  console.log(
    `assemble: dist/ built from ${chosen ?? 'static/ alone'} (${String(summary.pages)} pages, ${String(summary.withPolicy)} with a policy)`,
  )
  // @nofrontends-end
  // @frontends-start
  const given = frontendOverrides(
    process.argv,
    frontends.map((frontend) => frontend.dir),
  )
  const only = option('--only')
  const summary = assemble({
    statics: path.join(root, 'static'),
    dist: path.resolve(root, out),
    frontends: frontends.map((frontend) => ({
      dir: frontend.dir,
      build: path.resolve(root, given.get(frontend.dir) ?? `${frontend.path}/${frontend.out}`),
    })),
    only,
    sdk: path.resolve(root, sdkBuild), // @sdk
    allowMissingSdk, // @sdk
  })
  console.log(
    `assemble: dist/ built from ${only ?? frontends.map((frontend) => frontend.dir).join(', ')} (${String(summary.pages)} pages, ${String(summary.withPolicy)} with a policy)`,
  )
  // @frontends-end
} catch (error) {
  console.error(`assemble: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(error instanceof AssembleError ? 1 : 2)
}
