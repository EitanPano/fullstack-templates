import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { renderWithApp } from '@/testing/render'

import AppButton from './app-button.vue'

describe('AppButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a type=button with the primary variant and clicks through', async () => {
    const onClick = vi.fn()
    await renderWithApp(AppButton, { props: { onClick }, slots: { default: 'Save' } })

    const button = screen.getByRole('button', { name: 'Save' })
    await userEvent.click(button)

    expect(button).toHaveAttribute('type', 'button')
    expect(button).toHaveClass('button', 'button--primary')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the variant and size classes and the aria-label of an icon button', async () => {
    await renderWithApp(AppButton, {
      props: { variant: 'danger', size: 'icon', 'aria-label': 'Close' },
    })

    const button = screen.getByRole('button', { name: 'Close' })
    expect(button).toHaveClass('button--danger', 'button--icon')
  })

  it('is busy and inert while loading, with a silent spinner', async () => {
    const onClick = vi.fn()
    const { container } = await renderWithApp(AppButton, {
      props: { loading: true, onClick },
      slots: { default: 'Save' },
    })

    const button = screen.getByRole('button')
    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('is-loading')
    expect(within(button).queryByRole('status')).toBeNull()
    expect(container.querySelector('.spinner')).not.toBeNull()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not click when disabled', async () => {
    const onClick = vi.fn()
    await renderWithApp(AppButton, {
      props: { disabled: true, onClick },
      slots: { default: 'Save' },
    })

    await userEvent.click(screen.getByRole('button'))

    expect(onClick).not.toHaveBeenCalled()
  })

  it('submits when the type is submit', async () => {
    await renderWithApp(AppButton, { props: { type: 'submit' }, slots: { default: 'Go' } })

    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('renders a link instead of a button when to is set', async () => {
    await renderWithApp(AppButton, { props: { to: '/somewhere' }, slots: { default: 'Go' } })

    expect(screen.queryByRole('button')).toBeNull()
    const link = screen.getByRole('link', { name: 'Go' })
    expect(link).toHaveAttribute('href', '/somewhere')
    expect(link).toHaveClass('button')
  })

  it('reports an icon button without a name, since it has no text', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await renderWithApp(AppButton, { props: { size: 'icon' } })

    expect(error).toHaveBeenCalledWith(expect.stringContaining('aria-label'))
  })

  it('stays quiet outside development', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await renderWithApp(AppButton, { props: { size: 'icon' }, dev: false })

    expect(error).not.toHaveBeenCalled()
  })

  it('stays quiet for an icon button that has a name', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await renderWithApp(AppButton, { props: { size: 'icon', 'aria-label': 'Close' } })

    expect(error).not.toHaveBeenCalled()
  })
})
