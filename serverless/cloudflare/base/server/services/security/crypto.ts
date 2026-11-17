// crypto.ts belongs: the stateless cryptographic primitives, on the web platform's SubtleCrypto:
// SHA-256 and authenticated encryption of a secret at rest. Every function is async.
// It does not belong: anything that stores or reads state, or reads the environment (the caller
// passes the key from config: requireEncryptionKey in config/env.ts).
import { fromBase64Url, toBase64Url } from '../utils/encoding'

const IV_BYTES = 12

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// `keyBase64` is 32 random bytes, base64 (ENCRYPTION_KEY). The result is `<iv>.<ciphertext+tag>`,
// both base64url. `aad` is bound as AES-GCM additional data: a ciphertext sealed for one row
// (say `user:42:totp`) fails to open under another, so it cannot be replayed there. Pass the same
// `aad` to `decrypt`.
export async function encrypt(plain: string, keyBase64: string, aad = ''): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
    await importKey(keyBase64),
    new TextEncoder().encode(plain),
  )
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(data))}`
}

export async function decrypt(sealed: string, keyBase64: string, aad = ''): Promise<string> {
  try {
    const parts = sealed.split('.')
    if (parts.length !== 2) throw new Error('shape')
    const iv = fromBase64Url(parts[0] ?? '')
    if (iv.length !== IV_BYTES) throw new Error('iv')
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
      await importKey(keyBase64),
      fromBase64Url(parts[1] ?? ''),
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('invalid ciphertext')
  }
}

function importKey(keyBase64: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(keyBase64), (char) => char.charCodeAt(0))
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
