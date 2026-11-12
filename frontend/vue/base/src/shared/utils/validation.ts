import { z } from 'zod'

// The one file that names the validation library. The app builds and runs every schema through
// these functions, so a library switch rewrites this file and the plugin that writes
// services/generated/zod.gen.ts. Call no method on a schema outside this file.

// No `new Function` probe: zod 4 tries one to decide whether to compile its parsers, and under the
// deployed `script-src 'self'` the attempt is a reported CSP violation (it falls back, but the
// report is noise). This runs when the module loads, so a module that builds a schema at load
// (a *.form.ts over the generated schemas) imports this file first.
z.config({ jitless: true })
// True while the probe is off; the spec that guards the CSP reads it.
export const isEvalFree = () => z.config().jitless === true

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

export const flag = () => z.boolean()
export const literal = <const Value extends string | number | boolean>(
  value: Value,
  message?: string,
) => z.literal(value, message)

// Shapes.
export const object = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape)
// One field's schema out of an object schema, to reuse its limits.
export const field = <Shape extends z.ZodRawShape, Name extends keyof Shape>(
  schema: z.ZodObject<Shape>,
  name: Name,
) => schema.shape[name]
// An object schema cut down to some of its fields.
export const pick = <Shape extends z.ZodRawShape, Name extends keyof Shape & string>(
  schema: z.ZodObject<Shape>,
  names: Name[],
): z.ZodObject<Pick<Shape, Name>> =>
  schema.pick(Object.fromEntries(names.map((name) => [name, true])) as never)

// Modifiers.
export const either = <First extends Schema, Second extends Schema>(first: First, second: Second) =>
  first.or(second)

// Running a schema: `validate` returns the value or the issues, `isValid` answers yes or no,
// `parse` throws on a failure. An issue says which kind of rule failed (`rule`), on what kind of
// value (`kind`) and, for a limit, the limit (`limit`); `message` is the library's own wording.
export type IssueRule = 'required' | 'tooSmall' | 'tooBig' | 'email' | 'pattern' | 'invalid'
export type Issue = {
  path: PropertyKey[]
  message: string
  rule: IssueRule
  kind: 'text' | 'other'
  limit?: number
}
export type Result<Value> = { ok: true; value: Value } | { ok: false; issues: Issue[] }

function toIssue(issue: z.core.$ZodIssue): Issue {
  const { path, message } = issue
  switch (issue.code) {
    case 'invalid_type':
      return { path, message, rule: 'required', kind: 'other' }
    case 'too_small':
      return {
        path,
        message,
        rule: 'tooSmall',
        kind: issue.origin === 'string' ? 'text' : 'other',
        limit: Number(issue.minimum),
      }
    case 'too_big':
      return {
        path,
        message,
        rule: 'tooBig',
        kind: issue.origin === 'string' ? 'text' : 'other',
        limit: Number(issue.maximum),
      }
    case 'invalid_format':
      return { path, message, rule: issue.format === 'email' ? 'email' : 'pattern', kind: 'text' }
    default:
      return { path, message, rule: 'invalid', kind: 'other' }
  }
}

export function validate<S extends Schema>(schema: S, value: unknown): Result<Output<S>> {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, issues: result.error.issues.map(toIssue) }
}
export const isValid = (schema: Schema, value: unknown) => validate(schema, value).ok
export const parse = <S extends Schema>(schema: S, value: unknown): Output<S> => schema.parse(value)
