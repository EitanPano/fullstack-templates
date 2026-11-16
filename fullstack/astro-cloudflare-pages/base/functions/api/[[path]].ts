// [[path]].ts belongs: answering an unknown /api path with the not_found envelope. Pages tries
// every more specific route first, so this only sees what no route file claims.
// It does not belong: a real endpoint.
import { notFound } from '../../server/middleware/handler'

export const onRequest = notFound
