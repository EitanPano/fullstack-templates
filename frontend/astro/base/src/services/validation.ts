// validation.ts belongs: the one file that names zod. A page parses and reads limits through these
// functions, so a library switch rewrites this file. Schemas come from the generated client's
// zod.gen (services/generated).
// It does not belong: a schema (the generated zod.gen) or a form's DOM handling (services/forms.ts).
import { z } from 'zod'

// No `new Function` probe: zod 4 tries one to decide whether to compile its parsers, and under the
// deployed `script-src 'self'` (no eval) the attempt is a reported CSP violation. This runs when
// the module loads, so every module that parses imports this file first.
z.config({ jitless: true })
export const isEvalFree = () => z.config().jitless === true

export type Schema = z.ZodType
export type Input<S extends Schema> = z.input<S>
export type Output<S extends Schema> = z.output<S>

export type ParseResult<S extends Schema> =
  { success: true; data: Output<S> } | { success: false; paths: string[] }

// A failure carries the paths that failed, never a message: the page words an error from its copy.
export function parse<S extends Schema>(schema: S, value: unknown): ParseResult<S> {
  const result = schema.safeParse(value)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    paths: result.error.issues.map((issue) => issue.path.map(String).join('.')),
  }
}

// The native constraints (minlength, maxlength) of a text field, read off its schema.
export function stringLimits(schema: Schema): { minLength?: number; maxLength?: number } {
  const target = schema instanceof z.ZodOptional ? schema.unwrap() : schema
  if (!(target instanceof z.ZodString)) throw new Error('stringLimits needs a string schema')
  return {
    ...(target.minLength === null ? {} : { minLength: target.minLength }),
    ...(target.maxLength === null ? {} : { maxLength: target.maxLength }),
  }
}
