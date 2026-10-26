import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SiteError from '@/app/(site)/error'
import SiteLoading from '@/app/(site)/loading'

describe('the (site) route group states', () => {
  it('error.tsx is a user-safe message with a retry that calls reset', async () => {
    const reset = vi.fn()
    render(<SiteError error={new Error('secret stack detail')} reset={reset} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText(/secret stack detail/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('loading.tsx announces a busy region', () => {
    render(<SiteLoading />)

    expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute('aria-busy', 'true')
  })
})
