import { describe, expect, it } from 'vitest'

import type { ApiError } from '@/models/api-error/type'
import { isApiError } from '@/shared/utils/is-api-error'

const conflict: ApiError = { code: 'conflict', status: 409, message: 'default conflict' }

describe('isApiError', () => {
  it('recognises the plain object and nothing else', () => {
    expect(isApiError(conflict)).toBe(true)
    expect(isApiError(new Error('x'))).toBe(false)
    expect(isApiError(null)).toBe(false)
  })
})
