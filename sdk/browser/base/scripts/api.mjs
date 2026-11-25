// `bun run api` compares the public surface with etc/sdk.api.txt; `--update` rewrites the report
// (logic in lib/api.mjs).
import { runApi } from './lib/api.mjs'

const update = process.argv.includes('--update')
const ok = runApi({ root: process.cwd(), update })
if (!ok)
  console.error(
    'api: the public surface differs from etc/sdk.api.txt; run `bun run api:update` if it is intended',
  )
process.exit(ok ? 0 : 1)
