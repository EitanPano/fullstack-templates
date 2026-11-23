import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// The one file that names the validation library. The app builds and runs every schema through
// these functions, so a library switch rewrites this file and the plugin that writes
// services/generated/zod.gen.ts. Call no method on a schema outside this file.

// The generated schemas carry the API's limits (min 8, max 254) with the library's default
// wording. One global message map turns the common ones into text a person can act on, in the
// browser (the form resolver) and on the server (the action's input schema) alike. It only words
// an issue; it never changes a limit.
z.config({
  customError: (issue) => {
    if (issue.code === 'too_small' && issue.origin === 'string') {
      return `Use at least ${String(issue.minimum)} characters`
    }
    if (issue.code === 'too_big' && issue.origin === 'string') {
      return `Use ${String(issue.maximum)} characters or fewer`
    }
    if (issue.code === 'too_small' && issue.origin === 'number') {
      return `Enter ${String(issue.minimum)} or more`
    }
    if (issue.code === 'too_big' && issue.origin === 'number') {
      return `Enter ${String(issue.maximum)} or less`
    }
    if (issue.code === 'invalid_format' && issue.format === 'email') {
      return 'Enter a valid email address'
    }
    if (issue.code === 'invalid_type' && issue.input === undefined) return 'Required'
    return undefined
  },
})

export type Schema = z.ZodType
// What a form holds before validation, and what the schema returns after it.
export type Input<S extends Schema> = z.input<S>
export type Output<S extends Schema> = z.output<S>

type TextRule = { min?: number; max?: number; pattern?: RegExp; message?: string }
type NumberRule = { min?: number; max?: number; whole?: boolean; message?: string }

// Values. `message` words the failure of the rules given beside it.
export function text(rule: TextRule = {}) {
  let schema = z.string()
  if (rule.min !== undefined) schema = schema.min(rule.min, rule.message)
  if (rule.max !== undefined) schema = schema.max(rule.max, rule.message)
  if (rule.pattern) schema = schema.regex(rule.pattern, rule.message)
  return schema
}

export function number(rule: NumberRule = {}) {
  let schema = z.number()
  if (rule.whole) schema = schema.int(rule.message)
  if (rule.min !== undefined) schema = schema.gte(rule.min, rule.message)
  if (rule.max !== undefined) schema = schema.lte(rule.max, rule.message)
  return schema
}

export const email = (message?: string) => z.email(message)
export const url = (message?: string) => z.url(message)
export const isoDateTime = (message?: string) => z.iso.datetime(message)
export const literal = <const Value extends string | number | boolean>(
  value: Value,
  message?: string,
) => z.literal(value, message)

// Shapes.
export const object = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape)
export const extend = <Shape extends z.ZodRawShape, More extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
  more: More,
) => schema.extend(more)
// One field's schema out of an object schema, to reuse its limits.
export const field = <Shape extends z.ZodRawShape, Name extends keyof Shape>(
  schema: z.ZodObject<Shape>,
  name: Name,
) => schema.shape[name]

// Modifiers.
export const optional = <S extends Schema>(schema: S) => schema.optional()
export const withDefault = <S extends Schema>(schema: S, value: z.util.NoUndefined<z.output<S>>) =>
  schema.default(value)
// A rule the library has no name for; `path` puts the message on one field of an object.
export const check = <S extends Schema>(
  schema: S,
  passes: (value: z.output<S>) => boolean,
  issue: { message: string; path?: PropertyKey[] },
) => schema.refine(passes, { error: issue.message, path: issue.path })
export const transform = <S extends Schema, To>(schema: S, to: (value: z.output<S>) => To) =>
  schema.transform(to)
// Validates the output of `from` with `to`.
export const pipe = <From extends Schema, To extends z.ZodType<unknown, z.output<From>>>(
  from: From,
  to: To,
) => from.pipe(to)

// Running a schema: `validate` returns the value or the issues, `isValid` answers yes or no,
// `parse` throws on a failure.
export type Issue = { path: PropertyKey[]; message: string }
export type Result<Value> = { ok: true; value: Value } | { ok: false; issues: Issue[] }
export function validate<S extends Schema>(schema: S, value: unknown): Result<z.output<S>> {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  }
}
export const isValid = (schema: Schema, value: unknown) => validate(schema, value).ok
export const parse = <S extends Schema>(schema: S, value: unknown): z.output<S> =>
  schema.parse(value)

// React Hook Form's resolver for a schema built here.
export const formResolver = zodResolver
