// dev belongs: one command for development. Astro's dev server (HMR) serves the pages on 4321 and
// proxies /api to `wrangler pages dev` (the functions) on 8788; both stop together.
// It does not belong: building (`start` serves a build) or applying migrations (`bun run migrate`).
import { execSync, spawn } from 'node:child_process'

const children = [
  spawn('bunx astro dev', { shell: true, stdio: 'inherit' }),
  spawn('bunx wrangler pages dev --port 8788 --ip 127.0.0.1', { shell: true, stdio: 'inherit' }),
]

let stopping = false
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    try {
      // On Windows killing the shell leaves wrangler, and wrangler respawns workerd: end the tree.
      if (process.platform === 'win32')
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
      else child.kill('SIGTERM')
    } catch {
      // Already gone.
    }
  }
  process.exit(code)
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
