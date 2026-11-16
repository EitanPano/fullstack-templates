// services/validation.ts is the one file that names zod: the facade the pages parse with.
import { describe, expect, it } from 'vitest'

import { HealthResponse } from '@shared/schemas/health'
import { CreateModuleBody, MODULE_LIMITS } from '@shared/schemas/module'

import { isEvalFree, parse, stringLimits } from '../../../src/services/validation'

describe('parse', () => {
  it('returns the parsed value of a valid input', () => {
    const result = parse(HealthResponse, { status: 'ok', uptimeSeconds: 3, version: '1' })
    expect(result).toEqual({
      success: true,
      data: { status: 'ok', uptimeSeconds: 3, version: '1' },
    })
  })

  it('returns the paths that failed, never a message', () => {
    const result = parse(CreateModuleBody, { name: '' })
    expect(result).toEqual({ success: false, paths: ['name'] })
  })

  it('treats a value of the wrong type as one failed root path', () => {
    expect(parse(CreateModuleBody, 'nope')).toEqual({ success: false, paths: [''] })
  })
})

describe('stringLimits', () => {
  it('reads the limits of a field off the shared schema, never a copied number', () => {
    expect(stringLimits(CreateModuleBody.shape.name)).toEqual({
      minLength: MODULE_LIMITS.name.min,
      maxLength: MODULE_LIMITS.name.max,
    })
  })

  it('refuses a schema that is not a string', () => {
    expect(() => stringLimits(HealthResponse)).toThrow(/string/)
  })
})

describe('the CSP', () => {
  it('turns zod off its eval probe, which a script-src without eval reports as a violation', () => {
    expect(isEvalFree()).toBe(true)
  })
})
