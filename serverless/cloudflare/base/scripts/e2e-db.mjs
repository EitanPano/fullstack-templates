// e2e-db belongs: rebuilding the e2e database from nothing. It deletes `.e2e-state` and applies
// the migrations into it; `start` reads that folder and `dev` never does. The folder is the
// package's, wherever the script is started from.
// It does not belong: seeding product data (a journey creates its own through the API).
import { rmSync } from 'node:fs'
import path from 'node:path'

import { root, wranglerSync } from './lib/wrangler.mjs'

const state = path.join(root, '.e2e-state')

rmSync(state, { recursive: true, force: true })
process.exit(wranglerSync(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', state]))
