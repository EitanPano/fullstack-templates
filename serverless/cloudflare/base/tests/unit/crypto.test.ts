import { describe, expect, it } from 'vitest'

import { decrypt, encrypt, sha256 } from '../../server/services/security/crypto'

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

describe('sha256', () => {
  it('returns the hex digest', async () => {
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('encrypt and decrypt', () => {
  it('round-trips and never repeats a ciphertext', async () => {
    const first = await encrypt('secret', KEY)
    expect(first).not.toContain('secret')
    expect(await decrypt(first, KEY)).toBe('secret')
    expect(await encrypt('secret', KEY)).not.toBe(first)
  })

  it('refuses a tampered or truncated ciphertext, and a wrong key', async () => {
    const sealed = await encrypt('secret', KEY)
    const [iv = '', data = ''] = sealed.split('.')
    // The first character always changes: a fixed tail would equal the original one run in 256.
    const tampered = `${data.startsWith('A') ? 'B' : 'A'}${data.slice(1)}`
    await expect(decrypt(`${iv}.${tampered}`, KEY)).rejects.toThrow('invalid ciphertext')
    await expect(decrypt('only-one-part', KEY)).rejects.toThrow('invalid ciphertext')
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
    await expect(decrypt(sealed, other)).rejects.toThrow('invalid ciphertext')
  })

  it('binds the additional data: a ciphertext sealed for one row does not open for another', async () => {
    const sealed = await encrypt('secret', KEY, 'user:1:totp')
    expect(await decrypt(sealed, KEY, 'user:1:totp')).toBe('secret')
    await expect(decrypt(sealed, KEY, 'user:2:totp')).rejects.toThrow('invalid ciphertext')
    await expect(decrypt(sealed, KEY)).rejects.toThrow('invalid ciphertext')
    await expect(decrypt(await encrypt('secret', KEY), KEY, 'user:1:totp')).rejects.toThrow(
      'invalid ciphertext',
    )
  })

  it('treats no additional data as an empty string', async () => {
    expect(await decrypt(await encrypt('secret', KEY), KEY, '')).toBe('secret')
    expect(await decrypt(await encrypt('secret', KEY, ''), KEY)).toBe('secret')
  })
})
