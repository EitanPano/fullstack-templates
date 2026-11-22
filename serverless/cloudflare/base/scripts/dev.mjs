// dev belongs: the API alone, `wrangler dev` on __PORT__ with the development database
// (`.wrangler/state`, applied by `bun run migrate`), run from the package's own folder wherever it
// is started. The assets are an empty folder, so a stale dist/ is never served; a frontend's own
// dev server proxies /api to it. wrangler watches the source and reloads; it has no switch for that.
// It does not belong: the e2e state (start.mjs) or migrations.
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { root, runWrangler } from './lib/wrangler.mjs'

const empty = path.join(root, '.wrangler', 'dev-assets')
mkdirSync(empty, { recursive: true })

runWrangler(['dev', '--port', '__PORT__', '--ip', '127.0.0.1', '--local', '--assets', empty])
