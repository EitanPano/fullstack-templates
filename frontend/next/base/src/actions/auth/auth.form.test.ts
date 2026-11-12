import { afterEach, describe, expect, it, vi } from 'vitest'

import { validate, type Result } from '@/shared/utils/validation'

// The generated request schema depends on the server: Bun's OpenAPI has no email format, Python's
// has one (Hey API emits a regex, whose default message is not ours). The form must word the
// email error itself under both.
async function loadModels(email: 'plain' | 'regex') {
  vi.resetModules()
  vi.doMock('@/services/generated/zod.gen', async () => {
    const { object, text } = await import('@/shared/utils/validation')
    const field =
      email === 'plain'
        ? text({ max: 254 })
        : text({ max: 254, pattern: /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/ })
    const credentials = object({ email: field, password: text({ min: 8, max: 128 }) })
    return { zPostApiAuthLoginBody: credentials, zPostApiAuthSignupBody: credentials }
  })
  return import('./auth.form')
}

const messages = (result: Result<unknown>) =>
  result.ok ? undefined : result.issues.map((issue) => issue.message)

describe.each(['plain', 'regex'] as const)(
  'auth form schemas with a %s generated email',
  (shape) => {
    afterEach(() => {
      vi.doUnmock('@/services/generated/zod.gen')
    })

    it('accepts a valid sign-in and sign-up', async () => {
      const { signInSchema, signUpSchema } = await loadModels(shape)
      expect(validate(signInSchema, { email: 'a@b.co', password: 'correct horse' }).ok).toBe(true)
      expect(
        validate(signUpSchema, {
          email: 'a@b.co',
          password: 'correct horse',
          confirm: 'correct horse',
        }).ok,
      ).toBe(true)
    })

    it('words a malformed email in our copy on both forms', async () => {
      const { signInSchema, signUpSchema } = await loadModels(shape)
      const signIn = validate(signInSchema, { email: 'not-an-email', password: 'correct horse' })
      const signUp = validate(signUpSchema, {
        email: 'not-an-email',
        password: 'correct horse',
        confirm: 'correct horse',
      })
      expect(messages(signIn)).toEqual(['Enter a valid email address'])
      expect(messages(signUp)).toEqual(['Enter a valid email address'])
    })

    it('words an empty email in our copy', async () => {
      const { signInSchema } = await loadModels(shape)
      const result = validate(signInSchema, { email: '', password: 'correct horse' })
      expect(messages(result)).toEqual(['Enter a valid email address'])
    })

    it('keeps the contract length limit: a well-formed email over 254 characters is refused', async () => {
      const { signInSchema } = await loadModels(shape)
      const long = `${'a'.repeat(250)}@b.co`
      const result = validate(signInSchema, { email: long, password: 'correct horse' })
      expect(messages(result)).toEqual(['Enter a valid email address'])
    })
  },
)
