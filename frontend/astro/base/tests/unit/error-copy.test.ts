// The copy table of the envelope: every code the contract can produce has a message, and the lookup
// never returns the server's text. The codes are read from the generated zod schema of the error
// body, so a contract that gains a code fails here until the table has its copy.
import { describe, expect, it } from 'vitest'

import '../../src/services/validation'
import { ERROR_COPY } from '../../src/models/error/constant'
import { errorMessage } from '../../src/services/error-copy'
import { zErrorBody } from '../../src/services/generated/zod.gen'

const CLIENT_CODES = ['network', 'unknown', 'validation']

describe('the copy table', () => {
  it('has a message for every code of the contract, and for the codes only the page produces', () => {
    const contract = [...zErrorBody.shape.error.shape.code.options]
    expect(contract.length).toBeGreaterThan(5)
    expect(Object.keys(ERROR_COPY).sort()).toEqual([...contract, ...CLIENT_CODES].sort())
  })

  it('has a message for method_not_allowed, which the API adds to the envelope', () => {
    expect(ERROR_COPY.method_not_allowed).toBeTruthy()
  })

  it('words every message as a sentence that ends in a full stop', () => {
    for (const [code, message] of Object.entries(ERROR_COPY)) expect(message, code).toMatch(/\.$/)
  })
})

describe('errorMessage', () => {
  it('returns the copy of a known code', () => {
    expect(errorMessage('rate_limited')).toBe(ERROR_COPY.rate_limited)
  })

  it('falls back to the unknown copy for any other string', () => {
    expect(errorMessage('brand_new_code')).toBe(ERROR_COPY.unknown)
    expect(errorMessage('constructor')).toBe(ERROR_COPY.unknown)
  })
})
