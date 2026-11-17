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
    await expect(decrypt(`${iv}.${data.slice(0, -2)}AA`, KEY)).rejects.toThrow('invalid ciphertext')
    await expect(decrypt('only-one-part', KEY)).rejects.toThrow('invalid ciphertext')
    const other = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))
    await expect(decrypt(sealed, other)).rejects.toThrow('invalid ciphertext')
  })
})
