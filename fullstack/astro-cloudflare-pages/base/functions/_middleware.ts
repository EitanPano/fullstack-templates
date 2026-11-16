// _middleware.ts belongs: wrapping every function in the root middleware: request id, error
// envelope, response headers and the one log line. The logic is server/middleware/handler.ts.
// It does not belong: a gate for one route (that route file chains it) or logic of any kind.
import { rootMiddleware } from '../server/middleware/handler'

export const onRequest = rootMiddleware
