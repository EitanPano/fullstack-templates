// validate.ts belongs: request validation as a gate. Every route validates the parts it reads
// here, so a failure is always the same 400 envelope naming the part and the fields. A JSON body is
// read here too, capped at MAX_BODY_BYTES. It does not belong: business rules (the controller)
// or response shaping.
//
// The schemas live in api/<entity>/schema.ts and the same object goes to both calls:
//
//   export const onRequestPost = handle(validate(createEntityRequest), createEntity) // route file
//   const { body } = readInput(ctx, createEntityRequest) // controller
//
// Put it after any rate limit and before the controller: a 429 should not wait for parsing, and a
// controller never sees unparsed input.
import type { ZodType } from 'zod'

import { AppError } from '../services/utils/error'
import { readJsonBody } from './body'
import type { Context, Gate } from './handler'

export type RequestPart = 'body' | 'query' | 'params'
export type Schemas = Partial<Record<RequestPart, ZodType>>
export type Validated<S extends Schemas> = {
  [K in RequestPart as S[K] extends ZodType ? K : never]: S[K] extends ZodType<infer T> ? T : never
}

const PARTS: readonly RequestPart[] = ['body', 'query', 'params']

export function validate(schemas: Schemas): Gate {
  return async (ctx) => {
    const parsed: Partial<Record<RequestPart, unknown>> = {}
    for (const part of PARTS) {
      const schema = schemas[part]
      if (schema === undefined) continue
      const result = schema.safeParse(await read(ctx, part))
      if (!result.success) {
        throw new AppError(
          'validation_failed',
          `invalid ${part}`,
          result.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        )
      }
      parsed[part] = result.data
    }
    ctx.input = parsed
  }
}

// `schemas` only drives inference; the cast is the one place the parsed shape is asserted.
export function readInput<S extends Schemas>(ctx: Context, _schemas: S): Validated<S> {
  return ctx.input as Validated<S>
}

async function read(ctx: Context, part: RequestPart): Promise<unknown> {
  if (part === 'query') return Object.fromEntries(ctx.url.searchParams)
  if (part === 'params') return ctx.params
  return readJsonBody(ctx.request)
}
