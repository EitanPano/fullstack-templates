import { z } from 'zod'

// No `new Function` probe: zod 4 tries one to decide whether to compile its parsers, and under the
// deployed `script-src 'self'` the attempt is a reported CSP violation (it falls back, but the
// report is noise). main.ts imports this first, before any schema is built.
z.config({ jitless: true })
