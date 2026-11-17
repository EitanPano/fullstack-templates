// global-setup.ts belongs: building the functions once per run, in Node: the routing table, the
// middleware and every route compiled into one worker script that the tests call.
// It does not belong: a test or a per-test reset (setup.ts).
import { spawnSync } from 'node:child_process'
import path from 'node:path'

export default function setup(): void {
  const wrangler = path.join(import.meta.dirname, '../../node_modules/wrangler/bin/wrangler.js')
  const result = spawnSync(
    process.execPath,
    [wrangler, 'pages', 'functions', 'build', '--outdir', 'dist-functions'],
    { cwd: path.join(import.meta.dirname, '../..'), stdio: 'inherit' },
  )
  if (result.status !== 0) throw new Error('wrangler pages functions build failed')
}
