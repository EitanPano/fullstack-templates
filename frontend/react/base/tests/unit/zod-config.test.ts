import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import '@/shared/lib/zod-messages'

// Zod probes `new Function` once to decide whether it may compile validators. Under the deployed
// pages' `script-src 'self'` that probe is caught by zod but still reported as a CSP violation,
// so the SPA turns the compiler off (jitless) before any schema is built.
describe('zod in the browser', () => {
  it('runs without the Function-based compiler', () => {
    expect(z.config().jitless).toBe(true)
  })
})
