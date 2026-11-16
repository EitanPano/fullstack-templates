// [id].ts belongs: GET, PATCH and DELETE /api/module/{id}. A route file is its gate chain and the
// call to the controller, nothing else. It does not belong: logic (server/api/module/controller.ts).
import { deleteModuleRequest, getModuleRequest, updateModuleRequest } from '@shared/schemas/module'

import { deleteModule, getModule, updateModule } from '../../../server/api/module/controller'
import { handle, methodNotAllowed } from '../../../server/middleware/handler'
import { validate } from '../../../server/middleware/validate'

export const onRequestGet = handle(validate(getModuleRequest), getModule)
export const onRequestPatch = handle(validate(updateModuleRequest), updateModule)
export const onRequestDelete = handle(validate(deleteModuleRequest), deleteModule)
export const onRequest = methodNotAllowed('GET', 'PATCH', 'DELETE')
