// dev belongs: the functions alone, `wrangler pages dev` on __PORT__ with the development database
// (`.wrangler/state`, applied by `bun run migrate`), run from the package's own folder wherever it
// is started. A frontend's own dev server proxies /api to it; nothing here serves pages.
// It does not belong: the e2e state (start.mjs) or migrations.
import { runWrangler } from './lib/wrangler.mjs'

runWrangler(['pages', 'dev', '--port', '__PORT__', '--ip', '127.0.0.1'])
