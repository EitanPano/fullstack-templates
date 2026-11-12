import { describe, expect, it, vi } from 'vitest'

import type { ApiError } from '@/models/api-error/type'
import { reportFailure } from '@/shared/components/form/report-failure/report-failure'

vi.mock('@/shared/components/toaster/toaster', () => ({ showErrorToast: vi.fn() }))
const { showErrorToast } = await import('@/shared/components/toaster/toaster')

const form = () => ({
  setError: vi.fn(),
  getValues: () => ({ email: '', password: '', address: {}, items: [] }),
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

    expect(target.setError).toHaveBeenCalledWith(
      'email',
      { type: 'server', message: 'Bad email.' },
      { shouldFocus: true },
    )
    expect(showErrorToast).not.toHaveBeenCalled()
  })

  it('toasts the message when no field error names a registered field', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ nickname: 'Taken.' }))

    expect(target.setError).not.toHaveBeenCalled()
    expect(showErrorToast).toHaveBeenCalledWith('Check the form and try again.', undefined)
  })

  it('toasts an ApiError that has no field errors, with an optional description', () => {
    vi.clearAllMocks()

    reportFailure(form(), failure(), 'Nothing was saved.')

    expect(showErrorToast).toHaveBeenCalledWith('Check the form and try again.', 'Nothing was saved.')
  })

  it('toasts the generic line for anything that is not an ApiError', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, new Error('boom'))

    expect(target.setError).not.toHaveBeenCalled()
    expect(showErrorToast).toHaveBeenCalledWith('Something went wrong. Try again.', undefined)
  })

  it('lands nested and array paths on their top-level field', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ 'address.city': 'Too short.', 'items[0].name': 'Taken.' }))

    expect(target.setError).toHaveBeenCalledWith(
      'address.city',
      { type: 'server', message: 'Too short.' },
      { shouldFocus: true },
    )
    expect(target.setError).toHaveBeenCalledWith(
      'items[0].name',
      { type: 'server', message: 'Taken.' },
      { shouldFocus: false },
    )
    expect(showErrorToast).not.toHaveBeenCalled()
  })

  it('shows the known paths on fields and toasts only the unknown remainder', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ email: 'Bad email.', nickname: 'Taken.', theme: 'Unknown.' }))

    expect(target.setError).toHaveBeenCalledTimes(1)
    expect(showErrorToast).toHaveBeenCalledTimes(1)
    expect(showErrorToast).toHaveBeenCalledWith('Taken.\nUnknown.', undefined)
  })

  it('keeps the description on the toast when field errors are also present', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, failure({ email: 'Bad.', nickname: 'Taken.' }), 'Nothing was saved.')

    expect(showErrorToast).toHaveBeenCalledWith('Taken.', 'Nothing was saved.')
  })

  it('does not toast when every path is shown on a field, description or not', () => {
    vi.clearAllMocks()

    reportFailure(form(), failure({ email: 'Bad.' }), 'Nothing was saved.')

    expect(showErrorToast).not.toHaveBeenCalled()
  })
})
