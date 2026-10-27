import { describe, expect, it, vi } from 'vitest'

import { ActionError } from '@/shared/lib/action-error'
import { reportFailure } from '@/shared/ui/form/report-failure'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const { toast } = await import('sonner')

type Values = { email: string; password: string }
const form = () => ({
  setError: vi.fn(),
  getValues: () => ({ email: '', password: '' }) satisfies Values,
})

describe('reportFailure', () => {
  it('puts a field error on its registered field and shows no toast', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(
      target,
      new ActionError('Check the form and try again.', { fieldErrors: { email: 'Bad email.' } }),
    )

    expect(target.setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Bad email.' })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('toasts the message when no field error names a registered field', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(
      target,
      new ActionError('Check the form and try again.', { fieldErrors: { nickname: 'Taken.' } }),
    )

    expect(target.setError).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Check the form and try again.')
  })

  it('toasts a failure that has no field errors', () => {
    vi.clearAllMocks()
    const target = form()

    reportFailure(target, new Error('boom'))

    expect(target.setError).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Something went wrong. Try again.')
  })
})
