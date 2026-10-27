import { afterEach, describe, expect, it, vi } from 'vitest'

// The generated request schema depends on the server: Bun's OpenAPI has no email format, Python's
// has one (Hey API emits a regex, whose default message is not ours). The form must word the
// email error itself under both.
async function loadModels(email: 'plain' | 'regex') {
  vi.resetModules()
  vi.doMock('@/shared/api/generated/zod.gen', async () => {
    const { z } = await import('zod')
    const field =
      email === 'plain'
        ? z.string().max(254)
        : z
            .string()
            .max(254)
            .regex(/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/)
    const credentials = z.object({ email: field, password: z.string().min(8).max(128) })
    return { zPostApiAuthLoginBody: credentials, zPostApiAuthRegisterBody: credentials }
  })
  return import('@/feature/auth/model')
}

const messages = (result: { error?: { issues: { message: string }[] } }) =>
  result.error?.issues.map((issue) => issue.message)

describe.each(['plain', 'regex'] as const)('auth form schemas with a %s generated email', (shape) => {
  afterEach(() => {
    vi.doUnmock('@/shared/api/generated/zod.gen')
  })

  it('accepts a valid sign-in and sign-up', async () => {
    const { signInSchema, signUpSchema } = await loadModels(shape)
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'correct horse' }).success).toBe(
      true,
    )
    expect(
      signUpSchema.safeParse({ email: 'a@b.co', password: 'correct horse', confirm: 'correct horse' })
        .success,
    ).toBe(true)
  })

  it('words a malformed email in our copy on both forms', async () => {
    const { signInSchema, signUpSchema } = await loadModels(shape)
    const signIn = signInSchema.safeParse({ email: 'not-an-email', password: 'correct horse' })
    const signUp = signUpSchema.safeParse({
      email: 'not-an-email',
      password: 'correct horse',
      confirm: 'correct horse',
    })
    expect(messages(signIn)).toEqual(['Enter a valid email address'])
    expect(messages(signUp)).toEqual(['Enter a valid email address'])
  })

  it('words an empty email in our copy', async () => {
    const { signInSchema } = await loadModels(shape)
    const result = signInSchema.safeParse({ email: '', password: 'correct horse' })
    expect(messages(result)).toEqual(['Enter a valid email address'])
  })

  it('keeps the contract length limit: a well-formed email over 254 characters is refused', async () => {
    const { signInSchema } = await loadModels(shape)
    const long = `${'a'.repeat(250)}@b.co`
    const result = signInSchema.safeParse({ email: long, password: 'correct horse' })
    expect(messages(result)).toEqual(['Enter a valid email address'])
  })
})
