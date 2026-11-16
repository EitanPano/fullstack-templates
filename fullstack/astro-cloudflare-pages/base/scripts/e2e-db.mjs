// e2e-db belongs: rebuilding the e2e database from nothing. It deletes `.e2e-state` and applies
// the migrations into it; `start` reads that folder and `dev` never does.
// It does not belong: seeding product data (a journey creates its own through the API).
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const STATE = '.e2e-state'

rmSync(STATE, { recursive: true, force: true })
const result = spawnSync(`bunx wrangler d1 migrations apply DB --local --persist-to ${STATE}`, {
  shell: true,
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
