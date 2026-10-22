import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test'
import { OTP_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL } from '../../src/config/constants'
import { memory } from '../../src/infra/memory'
import { issueOtp, verifyOtp } from '../../src/services/security/otp'
import { parseDuration } from '../../src/services/utils/time'

const target = { type: 'email', value: 'a@example.com' } as const
const other = { type: 'email', value: 'b@example.com' } as const

beforeEach(async () => {
  await memory.close()
})
afterEach(() => setSystemTime())

function wrong(code: string): string {
  return code === '0'.repeat(OTP_LENGTH) ? '1'.repeat(OTP_LENGTH) : '0'.repeat(OTP_LENGTH)
}

describe('otp', () => {
  test('issueOtp returns exactly OTP_LENGTH digits', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    expect(code).toMatch(new RegExp(`^\\d{${String(OTP_LENGTH)}}$`))
  })

  test('the right code returns the userId once', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    expect(await verifyOtp({ purpose: 'login', target, code })).toBe('u1')
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
  })

  test('a wrong code returns null and the right code still works', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    expect(await verifyOtp({ purpose: 'login', target, code: wrong(code) })).toBeNull()
    expect(await verifyOtp({ purpose: 'login', target, code })).toBe('u1')
  })

  test('the entry is gone after OTP_MAX_ATTEMPTS wrong codes', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyOtp({ purpose: 'login', target, code: wrong(code) })).toBeNull()
    }
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
  })

  test('a correct code after the attempts are used up is refused and the entry is deleted', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect(await verifyOtp({ purpose: 'login', target, code: wrong(code) })).toBeNull()
    }
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
    // Gone for good: re-checking the same code finds no entry either.
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
  })

  test('parallel wrong guesses past the cap never reach the comparison', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    const results = await Promise.all(
      Array.from({ length: OTP_MAX_ATTEMPTS + 3 }, () =>
        verifyOtp({ purpose: 'login', target, code: wrong(code) }),
      ),
    )
    expect(results.every((result) => result === null)).toBe(true)
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
  })

  test('the correct code on the last allowed attempt still verifies', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await verifyOtp({ purpose: 'login', target, code: wrong(code) })
    }
    expect(await verifyOtp({ purpose: 'login', target, code })).toBe('u1')
  })

  test('an expired code returns null', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    setSystemTime(new Date(Date.now() + parseDuration(OTP_TTL) + 1000))
    expect(await verifyOtp({ purpose: 'login', target, code })).toBeNull()
  })

  test('a code does not verify under another purpose or target', async () => {
    const code = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    expect(await verifyOtp({ purpose: 'verify', target, code })).toBeNull()
    expect(await verifyOtp({ purpose: 'login', target: other, code })).toBeNull()
    expect(await verifyOtp({ purpose: 'login', target, code })).toBe('u1')
  })

  test('re-issuing resets the attempts', async () => {
    const first = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 1; i++) {
      await verifyOtp({ purpose: 'login', target, code: wrong(first) })
    }
    const second = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    await verifyOtp({ purpose: 'login', target, code: wrong(second) })
    expect(await verifyOtp({ purpose: 'login', target, code: second })).toBe('u1')
  })

  test('re-issuing replaces the earlier code', async () => {
    const first = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    let second = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    while (second === first) second = await issueOtp({ purpose: 'login', target, userId: 'u1' })
    expect(await verifyOtp({ purpose: 'login', target, code: first })).toBeNull()
    expect(await verifyOtp({ purpose: 'login', target, code: second })).toBe('u1')
  })
})
