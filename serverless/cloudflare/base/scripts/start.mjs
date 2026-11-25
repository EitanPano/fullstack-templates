// start belongs: serving the built site once, pages and API on one origin: `assemble`, then
// `wrangler dev` on the output folder as the assets and the e2e state folder `.e2e-state` (see
// e2e-db.mjs), on __PORT__. RATE_LIMIT_SCALE and LOG_LEVEL are taken from the shell when set. It
// works from the package's own folder wherever it is started, and ends its whole process tree when
// terminated. wrangler watches the source and has no switch for that; nothing edits it during a run.
// Options (for tests and tools, not for the shell; a relative path is relative to the package root):
//   --port <n>  --persist-to <dir>  --out <dir>  --frontend <output dir>
// `--out` and `--frontend` go to assemble: where dist is built (and served), and the frontend's build.
// @frontends-start
// Beside several frontends: `--frontend <dir>=<output dir>` (repeatable) and `--only <dir>` go to
// assemble too; without `--only` every frontend's build must exist, and all are served.
// @frontends-end
// @sdk-start
// With an SDK package SDK_KEYS and SDK_ENABLED are taken from the shell too, and SDK_DIR (read by
// assemble) names the SDK build to serve in place of the SDK package's own. A missing SDK build
// is a warning here (the API runs before the SDK is built) and an error for `bun run assemble`.
// @sdk-end
// It does not belong: building the frontend (run its build first), migrations (`bun run e2e:db`)
// or deployment.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { root, runWrangler } from './lib/wrangler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}

const port = option('--port', '__PORT__')
const state = path.resolve(root, option('--persist-to', '.e2e-state'))
const out = path.resolve(root, option('--out', 'dist'))
const frontend = option('--frontend', undefined) // @nofrontends
const frontends = args.flatMap((arg, at) => (arg === '--frontend' ? [args[at + 1]] : [])) // @frontends
const only = option('--only', undefined) // @frontends

const built = spawnSync(
  process.execPath,
  [
    path.join(here, 'assemble.mjs'),
    '--out',
    out,
    ...(frontend === undefined ? [] : ['--frontend', frontend]), // @nofrontends
    ...frontends.flatMap((pair) => ['--frontend', pair]), // @frontends
    ...(only === undefined ? [] : ['--only', only]), // @frontends
    '--allow-missing-sdk', // @sdk
  ],
  { stdio: 'inherit' },
)
if (built.status !== 0) process.exit(built.status ?? 1)

const vars = ['RATE_LIMIT_SCALE', 'LOG_LEVEL'] // @nosdk
const vars = ['RATE_LIMIT_SCALE', 'LOG_LEVEL', 'SDK_KEYS', 'SDK_ENABLED'] // @sdk
  .filter((name) => process.env[name] !== undefined && process.env[name] !== '')
  .flatMap((name) => ['--var', `${name}:${process.env[name]}`])

runWrangler([
  'dev',
  '--port',
  port,
  '--ip',
  '127.0.0.1',
  '--local',
  '--assets',
  out,
  '--persist-to',
  state,
  ...vars,
])
