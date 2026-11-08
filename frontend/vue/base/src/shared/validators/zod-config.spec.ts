import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import './zod-config'

// zod 4 probes `new Function('')` to decide whether to compile its parsers; under the deployed
// `script-src 'self'` that probe is a reported CSP violation. Jitless skips the probe.
describe('zod configuration', () => {
  it('turns the JIT compiler off, so no eval probe runs under a strict CSP', () => {
    expect(z.config().jitless).toBe(true)
  })
})
