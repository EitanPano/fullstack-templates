import type { RequestHandler } from 'express'

import { AppError } from '../services/utils/error'

// Mounted after every route: an unmatched path is a not_found envelope, not HTML.
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('not_found', `no route for ${req.method} ${req.path}`))
}
