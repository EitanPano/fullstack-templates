// validate.ts belongs: request validation as middleware. Every route validates the parts it
// reads here, so a failure is always the same 400 envelope naming the part and the fields.
// It does not belong: business rules (service.ts) or response shaping.
//
// Every route copies this pattern; the same object is passed to both calls so the handler's
// types follow the schemas:
//
//   const createInput = { body: CreateModuleBody }
//   moduleRoute.post('/', requireAuth, validate(createInput), async (_req, res) => { // @auth
//   moduleRoute.post('/', validate(createInput), async (_req, res) => { // @noauth
//     const { body } = readInput(res, createInput)
//   })
//
// Mount it after any rate limiter and before the handler: a 429 should not wait for parsing,
// and a handler never sees unparsed input. readInput is an explicit helper rather than a
// generic on Express's Locals because inference across mixed handlers is unreliable.
import type { RequestHandler, Response } from 'express'
import type { ZodType } from 'zod'

import { AppError } from '../services/utils/error'

export type RequestPart = 'body' | 'query' | 'params'
export type Schemas = Partial<Record<RequestPart, ZodType>>
export type Validated<S extends Schemas> = {
  [K in RequestPart as S[K] extends ZodType ? K : never]: S[K] extends ZodType<infer T> ? T : never
}

const PARTS: readonly RequestPart[] = ['body', 'query', 'params']

export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const parsed: Partial<Record<RequestPart, unknown>> = {}
    for (const part of PARTS) {
      const schema = schemas[part]
      if (schema === undefined) continue
      const result = schema.safeParse(req[part])
      if (!result.success) {
        next(
          new AppError(
            'validation_failed',
            `invalid ${part}`,
            result.error.issues.map((issue) => ({
              path: issue.path.map(String).join('.'),
              message: issue.message,
            })),
          ),
        )
        return
      }
      parsed[part] = result.data
    }
    res.locals.input = parsed
    next()
  }
}

// `schemas` only drives inference; the cast is the one place the parsed shape is asserted.
export function readInput<S extends Schemas>(res: Response, _schemas: S): Validated<S> {
  return res.locals.input as Validated<S>
}
