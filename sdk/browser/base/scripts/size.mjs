// `bun run size`: the size budget of the built outputs (logic in lib/size.mjs).
import { checkSizes } from './lib/size.mjs'

const { failures, rows } = checkSizes(process.cwd())
for (const row of rows) console.log(row)
for (const failure of failures) console.error(`size: ${failure}`)
process.exit(failures.length === 0 ? 0 : 1)
