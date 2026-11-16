// start belongs: serving the built site once, pages and functions on one origin, with no file
// watcher: `wrangler pages dev dist` on the e2e state folder `.e2e-state` (see e2e-db.mjs), port
// 8788 or PORT. It builds first when `dist/` is missing. RATE_LIMIT_SCALE and LOG_LEVEL are
// taken from the shell when set. It ends its whole process tree when terminated.
// It does not belong: migrations (`bun run e2e:db` runs first) or deployment.
import { execSync, spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const port = process.env.PORT ?? '8788'

if (!existsSync('dist/index.html')) {
  const build = spawnSync('bunx astro build', { shell: true, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const bindings = ['RATE_LIMIT_SCALE', 'LOG_LEVEL']
  .filter((name) => process.env[name] !== undefined && process.env[name] !== '')
  .map((name) => `--binding ${name}=${process.env[name]}`)
  .join(' ')

const server = spawn(
  `bunx wrangler pages dev dist --persist-to .e2e-state --port ${port} --ip 127.0.0.1 ${bindings}`,
  { shell: true, stdio: 'inherit' },
)

let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  try {
    // On Windows killing the shell leaves wrangler, and wrangler respawns workerd: end the tree.
    if (process.platform === 'win32')
      execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' })
    else server.kill('SIGTERM')
  } catch {
    // Already gone.
  }
  process.exit(code)
}
server.on('exit', (code) => stop(code ?? 1))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
