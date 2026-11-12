import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import ErrorState from './error-state.vue'

describe('ErrorState', () => {
  it('is an alert with the generic copy by default', async () => {
    await renderWithApp(ErrorState)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Something went wrong' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The page could not be shown. Try again in a moment.'),
    ).toBeInTheDocument()
  })

  it('shows the copy it is given instead of the generic one', async () => {
    await renderWithApp(ErrorState, {
      props: { heading: 'No posts', description: 'The list failed to load' },
    })

    expect(screen.getByRole('heading', { name: 'No posts' })).toBeInTheDocument()
    expect(screen.getByText('The list failed to load')).toBeInTheDocument()
  })

  it('asks to retry when the button is pressed', async () => {
    const view = await renderWithApp(ErrorState)

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(view.emitted('retry')).toHaveLength(1)
  })

  it('has no retry button when it is not retryable', async () => {
    await renderWithApp(ErrorState, { props: { retryable: false } })

    expect(screen.queryByRole('button')).toBeNull()
  })
})
