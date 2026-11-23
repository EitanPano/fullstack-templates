import * as z from 'zod'

// The one file that names the validation library. The app builds and runs every schema through
// these functions, so a library switch rewrites this file and the plugin that writes
// services/generated/zod.gen.ts. Call no method on a schema outside this file.

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
// An object schema narrowed to the named fields.
export const pick = <Shape extends z.ZodRawShape, Name extends keyof Shape & string>(
  schema: z.ZodObject<Shape>,
  names: readonly Name[],
) => {
  const mask = Object.fromEntries(names.map((name) => [name, true]))
  return (schema as unknown as { pick(mask: object): unknown }).pick(mask) as z.ZodObject<
    Pick<Shape, Name>
  >
}

// Modifiers.
// Accepts what either schema accepts.
export const either = <A extends Schema, B extends Schema>(a: A, b: B) => z.union([a, b])
// A rule the library has no name for; `path` puts the message on one field of an object.
export const check = <S extends Schema>(
  schema: S,
  passes: (value: z.output<S>) => boolean,
  issue: { message: string; path?: PropertyKey[] },
) => schema.refine(passes, { error: issue.message, path: issue.path })

// Running a schema: `validate` returns the value or the issues. An issue says which kind of rule
// failed (`type` is a missing or wrong-typed value, `min` and `max` a bound with its `limit`,
// `format` a pattern, `other` anything else) and whether the value is `text`.
export type IssueKind = 'type' | 'min' | 'max' | 'format' | 'other'
export type Issue = {
  path: PropertyKey[]
  message: string
  kind: IssueKind
  text: boolean
  limit?: number
  format?: string
}
export type Result<Value> = { ok: true; value: Value } | { ok: false; issues: Issue[] }

function toIssue(issue: z.core.$ZodIssue): Issue {
  const base = { path: issue.path, message: issue.message, text: false }
  switch (issue.code) {
    case 'invalid_type':
      return { ...base, kind: 'type' }
    case 'too_small':
      return {
        ...base,
        kind: 'min',
        text: issue.origin === 'string',
        limit: Number(issue.minimum),
      }
    case 'too_big':
      return {
        ...base,
        kind: 'max',
        text: issue.origin === 'string',
        limit: Number(issue.maximum),
      }
    case 'invalid_format':
      return { ...base, kind: 'format', format: issue.format }
    default:
      return { ...base, kind: 'other' }
  }
}

export function validate<S extends Schema>(schema: S, value: unknown): Result<z.output<S>> {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, issues: result.error.issues.map(toIssue) }
}
