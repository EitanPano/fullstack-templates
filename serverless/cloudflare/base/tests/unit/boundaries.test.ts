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
  ['server/api/module/routes.ts', ts('./service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../../middleware/handler'), 'never sees HTTP'],
  ['server/api/module/routes.ts', ts('../../services/logger'), 'controllers'],
  ['server/api/module/routes.ts', ts('../../infra/db'), 'controllers'],
  ['server/api/other/controller.ts', ts('../module/service'), 'controller.ts'],
  ['server/api/other/service.ts', ts('../module/controller'), 'data layer'],
  ['server/services/x.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  ['server/api/module/routes.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  // A module is reached through its controller only, from a controller, however it is spelled.
  ['server/api/other/routes.ts', ts('../module/service'), 'controller.ts'],
  ['server/api/other/routes.ts', ts('../module/model'), 'controller.ts'],
  ['server/api/other/controller.ts', ts('../module/model'), 'controller.ts'],
  ['server/api/other/controller.ts', ts('../../api/module/service'), "never through server/api/"],
  ['server/api/other/controller.ts', ts('../../api/module/model'), "never through server/api/"],
  ['server/api/other/service.ts', ts('../module/model'), 'data layer'],
  ['server/api/other/service.ts', ts('../../api/module/service'), 'never through server/api/'],
  // Hono belongs to the entries, the routes.ts files and middleware/handler.ts.
  ['server/api/module/controller.ts', ts('hono'), 'Hono is imported by'],
  ['server/api/module/service.ts', ts('hono'), 'Hono is imported by'],
  ['server/api/module/schema.ts', ts('hono'), 'Hono is imported by'],
  ['server/api/module/model.ts', ts('hono'), 'Hono is imported by'],
  ['server/middleware/validate.ts', ts('hono'), 'Hono is imported by'],
  ['server/middleware/rate-limit.ts', ts('hono/cors'), 'Hono is imported by'],
  ['server/config/x.ts', ts('hono'), 'Hono is imported by'],
  ['server/services/x.ts', ts('hono'), 'Hono is imported by'],
  ['server/infra/x.ts', ts('hono'), 'Hono is imported by'],
  ['server/models/module/x.ts', ts('hono'), 'Hono is imported by'],
  ['server/openapi.ts', ts('hono'), 'Hono is imported by'],
  // The entries are the routing and the Worker's export: nothing imports them.
  ['server/middleware/x.ts', ts('../server'), 'nothing imports them'],
  ['server/api/module/controller.ts', ts('./routes'), 'nothing imports them'],
  ['server/middleware/x.ts', ts('../index'), 'nothing imports them'],
  // An entry imports what a routes.ts imports, nothing deeper.
  ['server/index.ts', ts('./services/logger'), 'controllers'],
  ['server/index.ts', ts('./infra/db'), 'controllers'],
  ['server/index.ts', ts('./api/module/service'), 'controller.ts'],
  ['server/index.ts', 'void process.env.SECRET\n', 'server/config/env.ts'],
  ['server/server.ts', ts('./services/logger'), 'controllers'],
  // schema.ts is the leaf of its module.
  ['server/api/other/schema.ts', ts('../../middleware/handler'), 'leaf of a module'],
  ['server/api/other/schema.ts', ts('../../infra/db'), 'leaf of a module'],
  ['server/api/module/schema.ts', ts('./controller'), 'leaf of a module'],
  ['server/api/other/schema.ts', ts('../../config/env'), 'leaf of a module'],
  // openapi.ts reads the contract only, and the request path never reads it.
  ['server/openapi.ts', ts('./api/module/controller'), 'schema.ts and services/utils/ only'],
  ['server/openapi.ts', ts('./infra/db'), 'schema.ts and services/utils/ only'],
  ['server/middleware/x.ts', ts('../openapi'), 'request path never imports it'],
  ['server/api/module/routes.ts', ts('../../openapi'), 'request path never imports it'],
  ['server/api/module/controller.ts', ts('../../openapi'), 'request path never imports it'],
  // An api/admin/<module>/ is a module like any other: it reaches an entity's data, and a sibling
  // admin module's, through the controller only, and nothing reaches its service or model.
  ['server/api/admin/lead/controller.ts', ts('../../module/service'), "entity's controller.ts"],
  ['server/api/admin/lead/controller.ts', ts('../../module/model'), "entity's controller.ts"],
  ['server/api/admin/lead/routes.ts', ts('../../module/service'), "entity's controller.ts"],
  ['server/api/admin/lead/controller.ts', ts('../other/service'), 'controller.ts'],
  ['server/api/admin/lead/service.ts', ts('../../module/controller'), 'data layer'],
  ['server/api/admin/lead/service.ts', ts('../other/controller'), 'data layer'],
  ['server/api/admin/lead/model.ts', ts('../../module/model'), 'data layer'],
  ['server/api/admin/lead/controller.ts', ts('../../../api/module/service'), 'never through server/api/'],
  ['server/api/admin/lead/service.ts', ts('../../../middleware/handler'), 'never sees HTTP'],
  ['server/api/admin/lead/schema.ts', ts('../../../middleware/handler'), 'leaf of a module'],
  ['server/api/module/controller.ts', ts('../admin/lead/service'), 'controller.ts'],
  ['server/api/module/controller.ts', ts('../admin/lead/model'), 'controller.ts'],
  ['server/api/module/routes.ts', ts('../admin/routes'), 'only server.ts imports a routes.ts'],
  ['server/api/admin/lead/controller.ts', ts('hono'), 'Hono is imported by'],
  // Only server.ts imports a routes.ts, and api/admin/routes.ts the ones of its admin modules.
  ['server/api/module/routes.ts', ts('../health/routes'), 'only server.ts imports a routes.ts'],
  ['server/api/admin/lead/routes.ts', ts('../../module/routes'), 'only server.ts imports a routes.ts'],
  ['server/api/admin/routes.ts', ts('../module/routes'), 'controller.ts'],
  ['server/middleware/x.ts', ts('../api/admin/routes'), 'nothing imports them'],
  ['server/index.ts', ts('./api/admin/routes'), 'only server.ts imports a routes.ts'],
  ['server/api/admin/routes.ts', ts('../../services/logger'), 'controllers'],
  ['server/api/admin/routes.ts', ts('../../infra/db'), 'controllers'],
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
  ['server/api/module/routes.ts', ts('./controller')],
  ['server/api/module/routes.ts', ts('./schema')],
  ['server/api/module/routes.ts', ts('../../middleware/handler')],
  ['server/api/module/routes.ts', ts('../../config/constants')],
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
  ['server/api/module/routes.ts', ts('hono')],
  ['server/middleware/handler.ts', ts('hono')],
  ['server/server.ts', ts('hono')],
  ['server/server.ts', ts('./api/module/routes')],
  ['server/index.ts', ts('hono')],
  ['server/index.ts', ts('./middleware/rate-limit-cleanup')],
  ['server/index.ts', ts('./config/constants')],
  ['server/index.ts', ts('./server')],
  // The admin namespace: its router imports the gate and the admin modules' routers; a module
  // under it follows the module rules.
  ['server/api/admin/routes.ts', ts('./lead/routes')],
  ['server/api/admin/routes.ts', ts('../../middleware/admin-gate')],
  ['server/api/admin/routes.ts', ts('../../middleware/handler')],
  ['server/api/admin/routes.ts', ts('hono')],
  ['server/server.ts', ts('./api/admin/routes')],
  ['server/server.ts', ts('./middleware/frontend-host')],
  ['server/middleware/frontend-host.ts', ts('./handler')],
  ['server/middleware/admin-gate.ts', ts('../services/utils/error')],
  ['server/api/admin/lead/routes.ts', ts('./controller')],
  ['server/api/admin/lead/routes.ts', ts('./schema')],
  ['server/api/admin/lead/routes.ts', ts('../../../middleware/validate')],
  ['server/api/admin/lead/controller.ts', ts('./service')],
  ['server/api/admin/lead/controller.ts', ts('../../module/controller')],
  ['server/api/admin/lead/controller.ts', ts('../other/controller')],
  ['server/api/admin/lead/controller.ts', ts('../../../middleware/handler')],
  ['server/api/admin/lead/service.ts', ts('../../../infra/db')],
  ['server/api/admin/lead/service.ts', ts('../../../services/utils/pagination')],
  ['server/api/admin/lead/model.ts', ts('../../../models/lead/enum')],
  ['server/api/admin/lead/schema.ts', ts('../../../services/utils/zod')],
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
