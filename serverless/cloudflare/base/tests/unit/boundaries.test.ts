// The import rules of eslint.config.mjs, proved through the real config: one violation and one
// allowed case per rule, each violation's message naming the layer to use instead.
import { describe, expect, it } from 'vitest'

import { boundaryMessages, ts } from '../support/boundaries'

// [file, code, the words the message must carry]
const refused: [string, string, string][] = [
  ['server/models/module/x.ts', ts('../../services/logger'), 'models/ is a leaf'],
  ['server/config/x.ts', ts('../services/logger'), 'config/ imports nothing'],
  ['server/services/utils/x.ts', ts('../logger'), 'pure'],
  ['server/services/security/x.ts', ts('../../middleware/handler'), 'never imports middleware'],
  ['server/infra/x.ts', ts('../services/logger'), 'infra/ imports config/ and models/'],
  ['server/middleware/x.ts', ts('../api/module/controller'), 'never imports api/'],
  ['server/middleware/x.ts', ts('../api/module/service'), 'controller.ts'],
  ['server/services/x.ts', ts('../api/module/model'), 'controller.ts'],
  ['functions/api/x.ts', ts('../../server/api/module/service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../../middleware/handler'), 'never sees HTTP'],
  ['functions/api/x.ts', ts('../../server/services/logger'), 'controllers'],
  ['functions/api/x.ts', ts('../../server/infra/db'), 'controllers'],
  ['server/api/other/controller.ts', ts('../module/service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../module/controller'), 'data layer'],
  ['server/services/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  ['functions/api/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  // schema.ts is the leaf of its module.
  ['server/api/other/schema.ts', ts('../../middleware/handler'), 'leaf of a module'],
  ['server/api/other/schema.ts', ts('../../infra/db'), 'leaf of a module'],
  ['server/api/module/schema.ts', ts('./controller'), 'leaf of a module'],
  ['server/api/other/schema.ts', ts('../../config/env'), 'leaf of a module'],
  // openapi.ts reads the contract only, and the request path never reads it.
  ['server/openapi.ts', ts('./api/module/controller'), 'schema.ts and services/utils/ only'],
  ['server/openapi.ts', ts('./infra/db'), 'schema.ts and services/utils/ only'],
  ['server/middleware/x.ts', ts('../openapi'), 'request path never imports it'],
  ['functions/api/x.ts', ts('../../server/openapi'), 'request path never imports it'],
  ['server/api/module/controller.ts', ts('../../openapi'), 'request path never imports it'],
  // functions/ is routing: nothing under server/ imports it.
  ['server/middleware/x.ts', ts('../../functions/api/health/index'), 'nothing imports it'],
]

const allowed: [string, string][] = [
  ['server/models/module/x.ts', ts('./enum')],
  ['server/config/x.ts', ts('./constants')],
  ['server/services/utils/x.ts', ts('../../models/module/type')],
  ['server/services/utils/x.ts', ts('./error')],
  ['server/services/x.ts', ts('./utils/error')],
  ['server/infra/x.ts', ts('./db')],
  ['server/middleware/x.ts', ts('../infra/db')],
  ['server/middleware/x.ts', ts('../services/logger')],
  ['functions/api/x.ts', ts('../../server/api/module/controller')],
  ['functions/api/x.ts', ts('../../server/api/module/schema')],
  ['functions/api/x.ts', ts('../../server/middleware/handler')],
  ['functions/api/x.ts', ts('../../server/config/constants')],
  ['server/api/module/controller.ts', ts('./service')],
  ['server/api/module/controller.ts', ts('./schema')],
  ['server/api/module/controller.ts', ts('../../middleware/handler')],
  ['server/api/module/service.ts', ts('../../infra/db')],
  ['server/api/module/service.ts', ts('../../services/utils/pagination')],
  ['server/api/other/controller.ts', ts('../module/controller')],
  ['server/api/module/model.ts', ts('../../models/module/enum')],
  ['server/api/module/schema.ts', ts('../../models/module/enum')],
  ['server/api/module/schema.ts', ts('../../services/utils/zod')],
  ['server/api/module/schema.ts', ts('../../config/constants')],
  ['server/openapi.ts', ts('./api/module/schema')],
  ['server/openapi.ts', ts('./services/utils/openapi')],
  ['server/services/x.ts', 'void env.SECRET\n'],
]

describe('import boundaries', () => {
  it.each(refused)('%s is refused: %s', async (file, code, says) => {
    const messages = await boundaryMessages(file, code)
    expect(messages.length).toBeGreaterThan(0)
    expect(messages.join(' ')).toContain(says)
  })

  it.each(allowed)('%s is allowed: %s', async (file, code) => {
    expect(await boundaryMessages(file, code)).toEqual([])
  })
})
