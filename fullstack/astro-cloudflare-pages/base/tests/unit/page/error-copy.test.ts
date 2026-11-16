// The copy table of the envelope: every code the shared types and the server's error module can
// produce has a message, and the lookup never returns the server's text.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ERROR_CODES } from '@shared/types/api'

import { ERROR_COPY } from '../../../src/models/error/constant'
import { errorMessage } from '../../../src/services/error-copy'

// The codes of the server's error module, read from its status table.
function serverCodes(): string[] {
  const source = readFileSync('server/services/utils/error.ts', 'utf8')
  const table = /STATUS_BY_CODE[^{]*\{([^}]*)\}/.exec(source)?.[1] ?? ''
  return [...table.matchAll(/^\s*(\w+):/gm)].map((match) => match[1] as string)
}

describe('the copy table', () => {
  it('has a message for every code in shared/types/api.ts', () => {
    for (const code of ERROR_CODES) expect(ERROR_COPY[code], code).toBeTruthy()
  })

  it("has a message for every code of the server's error module", () => {
    const codes = serverCodes()
    expect(codes.length).toBeGreaterThan(5)
    for (const code of codes) expect(Object.hasOwn(ERROR_COPY, code), code).toBe(true)
    expect([...codes].sort()).toEqual([...ERROR_CODES].sort())
  })

  it('has a message for the codes only the page produces', () => {
    for (const code of ['network', 'unknown', 'validation'])
      expect(ERROR_COPY[code as 'network']).toBeTruthy()
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
