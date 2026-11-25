// `bun run api:types`: the contract step, closed on failure (logic in lib/contract.mjs).
import { runContract } from './lib/contract.mjs'

const { ok, message } = await runContract({ root: process.cwd() })
console[ok ? 'log' : 'error'](ok ? message : `contract: ${message}`)
process.exit(ok ? 0 : 1)
