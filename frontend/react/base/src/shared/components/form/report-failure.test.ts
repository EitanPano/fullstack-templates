import { describe, expect, it, vi } from 'vitest'

import type { ApiError } from '@/models/api-error'
import { reportFailure } from '@/shared/components/form/report-failure'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

const form = () => ({
  setError: vi.fn(),
  getValues: () => ({ email: '', password: '' }),
})
const failure = (fieldErrors?: Record<string, string>): ApiError => ({
  code: 'validation_failed',
  message: 'Check the form and try again.',
  fieldErrors,
})

describe('reportFailure', () => {
  it('puts a field error on its registered field and shows no toast', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ email: 'Bad email.' }))

    expect(target.setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Bad email.' })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('toasts the message when no field error names a registered field', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ nickname: 'Taken.' }))

    expect(target.setError).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Check the form and try again.')
  })

  it('toasts an ApiError that has no field errors, with an optional description', () => {
    vi.clearAllMocks()

    reportFailure(form(), failure(), 'Nothing was saved.')

    expect(toast.error).toHaveBeenCalledWith('Check the form and try again.', {
      description: 'Nothing was saved.',
    })
  })

  it('toasts the generic line for anything that is not an ApiError', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, new Error('boom'))

    expect(target.setError).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Something went wrong. Try again.')
  })
})
