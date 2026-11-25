// `.env.example` is what a person copies to `.env`: copied as it is, it must give a valid
// configuration. (The request path with no key is in tests/api/env.test.ts.)
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseConfig } from '../../server/config/env'

const text = readFileSync(path.resolve(import.meta.dirname, '../../.env.example'), 'utf8')

// The uncommented `NAME=value` lines, as a dotenv file reads them.
const values = Object.fromEntries(
  text
    .split('\n')
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
)

describe('.env.example', () => {
  it('parses as a valid configuration in every environment', () => {
    for (const environment of ['development', 'test', 'preview', 'production']) {
      expect(() => parseConfig({ ENVIRONMENT: environment, ...values })).not.toThrow() // @nosdk
      // @sdk-start
      // The local SDK_KEYS names a localhost origin, which production refuses.
      const local = environment === 'production' ? { ...values, SDK_KEYS: undefined } : values
      expect(() => parseConfig({ ENVIRONMENT: environment, ...local })).not.toThrow()
      // @sdk-end
    }
  })

  it('leaves ENCRYPTION_KEY commented out, so no placeholder is ever read as a key', () => {
    expect(values).not.toHaveProperty('ENCRYPTION_KEY')
    expect(text).toMatch(/^# ENCRYPTION_KEY=$/m)
    expect(text).toContain('openssl rand -base64 32')
  })
})
