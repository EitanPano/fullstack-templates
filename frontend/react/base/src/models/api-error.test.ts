import { describe, expect, it } from 'vitest'

import { isApiError, withCopy, type ApiError } from '@/models/api-error'

const conflict: ApiError = { code: 'conflict', status: 409, message: 'default conflict' }

describe('isApiError', () => {
  it('recognises the plain object and nothing else', () => {
    expect(isApiError(conflict)).toBe(true)
    expect(isApiError(new Error('x'))).toBe(false)
    expect(isApiError(null)).toBe(false)
  })
})

describe('withCopy', () => {
  it('replaces the message with the table entry for the code', () => {
    expect(withCopy(conflict, { conflict: 'Taken.' })).toEqual({ ...conflict, message: 'Taken.' })
  })

  it('keeps the message when the table has no entry', () => {
    expect(withCopy(conflict, { rate_limited: 'Slow down.' })).toEqual(conflict)
  })

  it('does not change the error it is given', () => {
    const before = structuredClone(conflict)

    withCopy(conflict, { conflict: 'Taken.' }, { conflict: 'email' })

    expect(conflict).toEqual(before)
  })

  it('puts a code on its field, with the table copy', () => {
    const result = withCopy(conflict, { conflict: 'Taken.' }, { conflict: 'email' })

    expect(result.fieldErrors).toEqual({ email: 'Taken.' })
    expect(result.message).toBe('Taken.')
  })

  it('leaves other codes without fields', () => {
    const limited: ApiError = { code: 'rate_limited', message: 'm' }

    expect(withCopy(limited, {}, { conflict: 'email' }).fieldErrors).toBeUndefined()
  })

  it('rewords the fields the server named, per field first and then per code', () => {
    const invalid: ApiError = {
      code: 'validation_failed',
      message: 'Check the form.',
      fieldErrors: { email: 'Check the form.', password: 'Check the form.' },
    }

    const result = withCopy(invalid, {
      validation_failed: 'Fix the form.',
      'validation_failed:email': 'Enter a valid email address',
    })

    expect(result.fieldErrors).toEqual({
      email: 'Enter a valid email address',
      password: 'Fix the form.',
    })
  })
})
