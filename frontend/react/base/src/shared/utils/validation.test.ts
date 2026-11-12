import { describe, expect, it, vi } from 'vitest'

import {
  check,
  extend,
  field,
  isValid,
  literal,
  number,
  object,
  optional,
  parse,
  pipe,
  text,
  transform,
  validate,
  withDefault,
  type Schema,
} from '@/shared/utils/validation'

const messages = (schema: Schema, value: unknown) => {
  const result = validate(schema, value)
  return result.ok ? [] : result.issues.map((issue) => issue.message)
}

describe('validate', () => {
  it('returns the value of a valid input', () => {
    const schema = object({
      name: text({ min: 2 }),
      seats: withDefault(number({ whole: true }), 1),
    })
    expect(validate(schema, { name: 'Ada' })).toEqual({
      ok: true,
      value: { name: 'Ada', seats: 1 },
    })
  })

  it('returns each issue with its path and message', () => {
    const schema = object({
      name: text({ min: 2, message: 'Too short' }),
      terms: literal(true, 'Accept the terms'),
    })
    expect(validate(schema, { name: 'A', terms: false })).toEqual({
      ok: false,
      issues: [
        { path: ['name'], message: 'Too short' },
        { path: ['terms'], message: 'Accept the terms' },
      ],
    })
  })

  it('words the common failures in our copy', () => {
    expect(messages(text({ min: 8 }), 'short')).toEqual(['Use at least 8 characters'])
    expect(messages(text({ max: 3 }), 'longer')).toEqual(['Use 3 characters or fewer'])
    expect(messages(number({ min: 1 }), 0)).toEqual(['Enter 1 or more'])
    expect(messages(number({ max: 5 }), 6)).toEqual(['Enter 5 or less'])
    expect(messages(object({ name: text() }), {})).toEqual(['Required'])
  })
})

describe('the schema builders', () => {
  it('extends an object schema and reuses one of its fields', () => {
    const base = object({ email: text({ max: 5 }) })
    const wider = extend(base, { next: optional(text()) })
    expect(isValid(wider, { email: 'a@b.c' })).toBe(true)
    expect(isValid(wider, { email: 'a@b.c', next: 7 })).toBe(false)
    expect(isValid(field(base, 'email'), 'longer than five')).toBe(false)
  })

  it('puts the message of a check on the path it names', () => {
    const schema = check(
      object({ password: text(), confirm: text() }),
      (value) => value.password === value.confirm,
      { path: ['confirm'], message: 'Passwords do not match' },
    )
    expect(isValid(schema, { password: 'a', confirm: 'a' })).toBe(true)
    expect(validate(schema, { password: 'a', confirm: 'b' })).toEqual({
      ok: false,
      issues: [{ path: ['confirm'], message: 'Passwords do not match' }],
    })
  })

  it('validates what a transform returns', () => {
    const header = pipe(
      transform(optional(text()), (value) => value?.trim().toLowerCase() || undefined),
      optional(text({ pattern: /^[a-z0-9-]+$/, message: 'Not a header name' })),
    )
    expect(parse(header, ' X-Real-IP ')).toBe('x-real-ip')
    expect(parse(header, undefined)).toBeUndefined()
    expect(() => parse(header, 'two words')).toThrow('Not a header name')
  })
})

// The library probes `new Function` once to decide whether it may compile validators. Under the
// deployed pages' `script-src 'self'` that probe is caught but still reported as a CSP violation,
// so the facade turns the compiler off before any schema is built.
describe('the library in the browser', () => {
  it('runs without the Function-based compiler', async () => {
    vi.resetModules()
    const probes: unknown[][] = []
    const Native = globalThis.Function
    vi.stubGlobal(
      'Function',
      new Proxy(Native, {
        construct(target, args: unknown[], newTarget) {
          probes.push(args)
          return Reflect.construct(target, args, newTarget) as object
        },
      }),
    )
    const fresh = await import('@/shared/utils/validation')

    expect(fresh.isValid(fresh.object({ name: fresh.text() }), { name: 'Ada' })).toBe(true)
    expect(probes).toEqual([])
  })
})
