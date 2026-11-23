import { describe, expect, it } from 'vitest'

import {
  either,
  field,
  flag,
  isEvalFree,
  isValid,
  literal,
  number,
  object,
  parse,
  pick,
  text,
  validate,
} from './validation'

// zod 4 probes `new Function('')` to decide whether to compile its parsers; under the deployed
// `script-src 'self'` that probe is a reported CSP violation. Jitless skips the probe.
describe('validation configuration', () => {
  it('turns the JIT compiler off, so no eval probe runs under a strict CSP', () => {
    expect(isEvalFree()).toBe(true)
  })
})

describe('validate', () => {
  const schema = object({ name: text({ min: 2, max: 5 }), age: number({ whole: true, min: 1 }) })

  it('returns the parsed value when everything holds', () => {
    expect(validate(schema, { name: 'Ann', age: 3 })).toEqual({
      ok: true,
      value: { name: 'Ann', age: 3 },
    })
  })

  it('classifies each failure by rule, kind and limit', () => {
    const result = validate(schema, { name: 'A', age: 0 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ path, rule, kind, limit }) => ({ path, rule, kind, limit }))).toEqual([
      { path: ['name'], rule: 'tooSmall', kind: 'text', limit: 2 },
      { path: ['age'], rule: 'tooSmall', kind: 'other', limit: 1 },
    ])
  })

  it('reports a missing value as required, a long text as too big and a bad pattern', () => {
    const rules = object({ code: text({ max: 3 }), tag: text({ pattern: /^a+$/ }) })
    const result = validate(rules, { code: 'abcd' })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(({ path, rule }) => [path, rule])).toEqual([
      [['code'], 'tooBig'],
      [['tag'], 'required'],
    ])
    const pattern = validate(rules, { code: 'a', tag: 'b' })
    expect(pattern.ok ? [] : pattern.issues.map(({ rule }) => rule)).toEqual(['pattern'])
  })
})

describe('schema builders', () => {
  it('isValid answers yes or no, parse throws on a failure', () => {
    expect(isValid(text({ min: 1 }), 'x')).toBe(true)
    expect(isValid(text({ min: 1 }), '')).toBe(false)
    expect(() => parse(flag(), 'yes')).toThrow()
    expect(parse(flag(), true)).toBe(true)
  })

  it('field reuses one limit of an object schema, either widens it', () => {
    const base = object({ phone: text({ min: 3 }) })
    const widened = either(field(base, 'phone'), literal(''))

    expect(isValid(widened, '')).toBe(true)
    expect(isValid(widened, 'ab')).toBe(false)
  })

  it('pick keeps the named fields only', () => {
    const base = object({ a: text(), b: text() })

    expect(isValid(pick(base, ['a']), { a: 'x' })).toBe(true)
    expect(isValid(pick(base, ['a']), {})).toBe(false)
  })
})
