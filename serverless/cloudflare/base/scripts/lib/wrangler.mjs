// wrangler (lib) belongs: running the local wrangler from node_modules, in the package's own
// folder wherever the script was started from, so a script never depends on `bunx` or a shell, and
// ending its whole process tree when the script is asked to stop. On Windows killing a wrapper
// shell leaves wrangler running and wrangler respawns workerd: `taskkill /T` ends the tree.
// It does not belong: choosing wrangler's arguments (dev.mjs, start.mjs, e2e-db.mjs).
import { execSync, spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The package root, from this file's location: scripts/lib/ is two folders below it.
export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

const bin = path.join(root, 'node_modules/wrangler/bin/wrangler.js')

// Runs wrangler to completion; returns its exit status.
export function wranglerSync(args) {
  return spawnSync(process.execPath, [bin, ...args], { cwd: root, stdio: 'inherit' }).status ?? 1
}

// Runs wrangler until it exits or this process is asked to stop (SIGINT, SIGTERM); ends the
// process with its status. A failure of wrangler prints its code and signal, so a silent exit
// leaves a trace.
export function runWrangler(args) {
  const child = spawn(process.execPath, [bin, ...args], { cwd: root, stdio: 'inherit' })
  let exited = false
  let stopping = false

  // Only on a request to stop, and only while the child still runs: from the child's own exit the
  // pid is dead, and the system may already have given it to another process.
  function stop() {
    if (stopping) return
    stopping = true
    if (!exited) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${String(child.pid)} /T /F`, { stdio: 'ignore' })
        } else child.kill('SIGTERM')
      } catch {
        // Already gone.
      }
    }
    process.exit(0)
  }

  child.on('error', (error) => {
    process.stderr.write(`wrangler could not start: ${error.message}\n`)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    exited = true
    if (stopping) return
    if (code !== 0) {
      process.stderr.write(
        `wrangler exited with code ${String(code)} and signal ${String(signal)}\n`,
      )
    }
    process.exit(code ?? 1)
  })
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
