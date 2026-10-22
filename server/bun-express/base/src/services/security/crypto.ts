// @auth-start
// crypto.ts belongs: the stateless cryptographic primitives the auth flow composes (password
// hashing, HMAC, SHA-256, random tokens, authenticated encryption). It does not belong: token
// signing (jwt.ts), cookies (cookies.ts) or anything that stores or reads state.
// @auth-end
// @noauth-start
// crypto.ts belongs: the stateless cryptographic primitives (password hashing, HMAC, SHA-256,
// random tokens, authenticated encryption). It does not belong: anything that stores or reads
// state.
// @noauth-end
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { env } from '../../config/env'

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: 'argon2id' })
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash)
}

export function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
// @auth-start

// The user module verifies an unknown email against this hash so a login for a missing account
// costs the same time as one for a real account; timing then does not reveal which emails exist.
export const DUMMY_HASH: string = Bun.password.hashSync(randomToken(), { algorithm: 'argon2id' })
// @auth-end

const KEY = Buffer.from(env.ENCRYPTION_KEY, 'base64')
const IV_BYTES = 12
const TAG_BYTES = 16

// Nothing in the template calls encrypt/decrypt yet; they are the home for encrypting a secret
// at rest (for example a third-party token stored on a record).
export function encrypt(plain: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv, tag, data].map((part) => part.toString('base64url')).join('.')
}

export function decrypt(sealed: string): string {
  const parts = sealed.split('.')
  if (parts.length !== 3) throw new Error('invalid ciphertext')
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url')) as [
    Buffer,
    Buffer,
    Buffer,
  ]
  // Fail closed on lengths: without an explicit authTagLength Node accepts a truncated GCM tag,
  // which cuts the cost of a forgery to roughly 2^-32 per attempt.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('invalid ciphertext')
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv, { authTagLength: TAG_BYTES })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('invalid ciphertext')
  }
}
