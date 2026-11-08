import { describe, expect, it, vi } from 'vitest'

import type { FieldError } from './zod-form'
import { applyFieldErrors } from './server-errors'

function target() {
  return {
    values: { email: '', password: '' } as Record<string, unknown>,
    serverErrors: {} as Record<string, FieldError>,
    touch: vi.fn(),
  }
}

describe('applyFieldErrors', () => {
  it('writes errors.invalid on each field the paths name, never the server text, and touches it', () => {
    const form = target()

    const unmapped = applyFieldErrors(form, {
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'], password: ['invalid'] },
    })

    expect(form.serverErrors).toEqual({
      email: { messageKey: 'errors.invalid' },
      password: { messageKey: 'errors.invalid' },
    })
    expect(form.touch).toHaveBeenCalledWith('email')
    expect(form.touch).toHaveBeenCalledWith('password')
    expect(unmapped).toEqual([])
  })

  it('returns the paths no field has so the page toasts them once', () => {
    const form = target()

    const unmapped = applyFieldErrors(form, {
      code: 'validation_failed',
      fieldErrors: { email: ['invalid'], 'items.1.label': ['invalid'], toString: ['invalid'] },
    })

    expect(unmapped).toEqual(['items.1.label', 'toString'])
    expect(Object.keys(form.serverErrors)).toEqual(['email'])
  })

  it('does nothing for an error without field errors', () => {
    const form = target()

    expect(applyFieldErrors(form, { code: 'validation_failed' })).toEqual([])
    expect(form.serverErrors).toEqual({})
  })
})
