import { describe, expect, test } from 'bun:test'
import {
  DUMMY_HASH, // @auth
  decrypt,
  encrypt,
  hashPassword,
  hmac,
  randomToken,
  sha256,
  verifyPassword,
} from '../../src/services/security/crypto'

describe('password hashing', () => {
  test('a hash verifies its password and rejects another', async () => {
    const hash = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
  })

  test('two hashes of one password differ', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
  // @auth-start

  test('DUMMY_HASH is a string no unrelated password matches', async () => {
    expect(typeof DUMMY_HASH).toBe('string')
    expect(DUMMY_HASH.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword('unrelated-password', DUMMY_HASH)).toBe(false)
  })
  // @auth-end
})

describe('hmac and sha256', () => {
  test('hmac is deterministic hex and differs by secret and data', () => {
    const a = hmac('s1', 'data')
    expect(a).toBe(hmac('s1', 'data'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(hmac('s2', 'data')).not.toBe(a)
    expect(hmac('s1', 'other')).not.toBe(a)
  })

  test('sha256 matches the known digest', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('randomToken', () => {
  test('is base64url of the requested length and unique', () => {
    const token = randomToken(16)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(Buffer.from(token, 'base64url').length).toBe(16)
    expect(Buffer.from(randomToken(), 'base64url').length).toBe(32)
    expect(randomToken()).not.toBe(randomToken())
  })
})

describe('encrypt and decrypt', () => {
  test('round trips and uses a fresh IV each time', () => {
    const sealed = encrypt('a secret value')
    expect(sealed.split('.')).toHaveLength(3)
    expect(decrypt(sealed)).toBe('a secret value')
    expect(encrypt('a secret value')).not.toBe(sealed)
  })

  test('a flipped ciphertext or tag character throws', () => {
    const [iv, tag, data] = encrypt('payload').split('.') as [string, string, string]
    const flip = (text: string) => (text.startsWith('A') ? 'B' : 'A') + text.slice(1)
    expect(() => decrypt([iv, tag, flip(data)].join('.'))).toThrow('invalid ciphertext')
    expect(() => decrypt([iv, flip(tag), data].join('.'))).toThrow('invalid ciphertext')
  })

  test('a tag truncated to 8 bytes throws', () => {
    const [iv, tag, data] = encrypt('payload').split('.') as [string, string, string]
    const short = Buffer.from(tag, 'base64url').subarray(0, 8).toString('base64url')
    expect(() => decrypt([iv, short, data].join('.'))).toThrow('invalid ciphertext')
  })

  test('an IV of 8 bytes throws', () => {
    const [iv, tag, data] = encrypt('payload').split('.') as [string, string, string]
    const short = Buffer.from(iv, 'base64url').subarray(0, 8).toString('base64url')
    expect(() => decrypt([short, tag, data].join('.'))).toThrow('invalid ciphertext')
  })

  test('a tampered IV throws', () => {
    const [iv, tag, data] = encrypt('payload').split('.') as [string, string, string]
    const bytes = Buffer.from(iv, 'base64url')
    bytes[0] = (bytes[0] ?? 0) ^ 1
    expect(() => decrypt([bytes.toString('base64url'), tag, data].join('.'))).toThrow(
      'invalid ciphertext',
    )
  })

  test('a malformed string throws', () => {
    expect(() => decrypt('not-sealed')).toThrow('invalid ciphertext')
    expect(() => decrypt('a.b')).toThrow('invalid ciphertext')
    expect(() => decrypt('')).toThrow('invalid ciphertext')
  })
})
