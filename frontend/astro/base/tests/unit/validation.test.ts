// services/validation.ts is the one file that names zod: the facade a page parses with.
import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { isEvalFree, parse, stringLimits } from '../../src/services/validation'

const Body = z.object({ name: z.string().min(1).max(100), note: z.string().max(20).optional() })

describe('parse', () => {
  it('returns the parsed value of a valid input', () => {
    expect(parse(Body, { name: 'a' })).toEqual({ success: true, data: { name: 'a' } })
  })

  it('returns the paths that failed, never a message', () => {
    expect(parse(Body, { name: '' })).toEqual({ success: false, paths: ['name'] })
  })

  it('treats a value of the wrong type as one failed root path', () => {
    expect(parse(Body, 'nope')).toEqual({ success: false, paths: [''] })
  })
})

describe('stringLimits', () => {
  it('reads the limits of a field off the schema, never a copied number', () => {
    expect(stringLimits(Body.shape.name)).toEqual({ minLength: 1, maxLength: 100 })
  })

  it('reads an optional string and leaves out a limit the schema does not set', () => {
    expect(stringLimits(Body.shape.note)).toEqual({ maxLength: 20 })
  })

  it('refuses a schema that is not a string', () => {
    expect(() => stringLimits(Body)).toThrow(/string/)
  })
})

describe('the CSP', () => {
  it('turns zod off its eval probe, which a script-src without eval reports as a violation', () => {
    expect(isEvalFree()).toBe(true)
  })
})
