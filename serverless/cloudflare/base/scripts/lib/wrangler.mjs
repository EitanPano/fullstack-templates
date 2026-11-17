// wrangler (lib) belongs: running the local wrangler from node_modules, so a script never depends
// on `bunx` or a shell, and ending its whole process tree when the script is terminated. On Windows
// killing a wrapper shell leaves wrangler running and wrangler respawns workerd: `taskkill /T`
// ends the tree. It does not belong: choosing wrangler's arguments (dev.mjs, start.mjs, e2e-db.mjs).
import { execSync, spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const bin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/wrangler/bin/wrangler.js',
)

// Runs wrangler to completion; returns its exit status.
export function wranglerSync(args) {
  return spawnSync(process.execPath, [bin, ...args], { stdio: 'inherit' }).status ?? 1
}

// Runs wrangler until it exits or this process is terminated; ends the process with its status.
export function runWrangler(args) {
  const child = spawn(process.execPath, [bin, ...args], { stdio: 'inherit' })
  let stopping = false
  function stop(code) {
    if (stopping) return
    stopping = true
    try {
      if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' })
      else child.kill('SIGTERM')
    } catch {
      // Already gone.
    }
    process.exit(code)
  }
  child.on('exit', (code) => stop(code ?? 1))
  process.on('SIGINT', () => stop(0))
  process.on('SIGTERM', () => stop(0))
}
