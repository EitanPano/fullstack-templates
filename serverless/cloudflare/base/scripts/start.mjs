// start belongs: serving the built site once, pages and functions on one origin, with no file
// watcher: `assemble`, then `wrangler pages dev dist` on the e2e state folder `.e2e-state` (see
// e2e-db.mjs), on __PORT__. RATE_LIMIT_SCALE and LOG_LEVEL are taken from the shell when set. It
// ends its whole process tree when terminated. Options (for tests and tools, not for the shell):
//   --port <n>  --persist-to <dir>  --frontend <output dir>   (the last goes to assemble)
// It does not belong: building the frontend (run its build first), migrations (`bun run e2e:db`)
// or deployment.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runWrangler } from './lib/wrangler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const at = args.indexOf(name)
  return at === -1 ? fallback : args[at + 1]
}

const port = option('--port', '__PORT__')
const state = option('--persist-to', '.e2e-state')
const frontend = option('--frontend', undefined)

const built = spawnSync(
  process.execPath,
  [path.join(here, 'assemble.mjs'), ...(frontend === undefined ? [] : ['--frontend', frontend])],
  { stdio: 'inherit' },
)
if (built.status !== 0) process.exit(built.status ?? 1)

const bindings = ['RATE_LIMIT_SCALE', 'LOG_LEVEL']
  .filter((name) => process.env[name] !== undefined && process.env[name] !== '')
  .flatMap((name) => ['--binding', `${name}=${process.env[name]}`])

runWrangler(['pages', 'dev', 'dist', '--persist-to', state, '--port', port, '--ip', '127.0.0.1', ...bindings])
