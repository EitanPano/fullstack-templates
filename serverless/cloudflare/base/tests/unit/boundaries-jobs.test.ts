// The import rules of workers/ (the `jobs` flag), proved through the real eslint.config.mjs: a job
// entry imports what a route file imports, and nothing imports it.
import { describe, expect, it } from 'vitest'

import { boundaryMessages, ts } from '../support/boundaries'

// [file, code, the words the message must carry]
const refused: [string, string, string][] = [
  ['workers/jobs/x.ts', ts('../../server/services/logger'), 'controllers'],
  ['workers/jobs/x.ts', ts('../../server/infra/db'), 'controllers'],
  ['workers/jobs/x.ts', ts('../../server/models/module/enum'), 'controllers'],
  ['workers/jobs/x.ts', ts('../../server/api/module/service'), 'controller.ts'],
  ['workers/jobs/x.ts', ts('../../server/api/module/model'), 'controller.ts'],
  ['workers/jobs/x.ts', ts('../../functions/api/health/index'), 'nothing imports it'],
  ['workers/jobs/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  ['server/middleware/x.ts', ts('../../workers/jobs/index'), 'nothing imports it'],
  ['functions/api/x.ts', ts('../../workers/jobs/index'), 'nothing imports it'],
]

const allowed: [string, string][] = [
  ['workers/jobs/x.ts', ts('../../server/middleware/rate-limit-cleanup')],
  ['workers/jobs/x.ts', ts('../../server/config/constants')],
  ['workers/jobs/x.ts', ts('../../server/api/module/controller')],
  ['workers/jobs/x.ts', ts('./other')],
]

describe('import boundaries of workers/', () => {
  it.each(refused)('%s is refused: %s', async (file, code, says) => {
    const messages = await boundaryMessages(file, code)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toContain(says)
  })

  it.each(allowed)('%s is allowed: %s', async (file, code) => {
    expect(await boundaryMessages(file, code)).toEqual([])
  })
})
