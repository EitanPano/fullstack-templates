import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useNotificationStore } from '@/store/notification.store'
import { renderWithApp } from '@/testing/render'
import { Page } from '@/testing/stubs'

import AppMainLayout from './app-main-layout.vue'

// Plain content: a page that renders its own <header> could be reported as a banner by the
// testing library, even inside main, and that is not what these tests are about.
const routes = [{ path: '/', component: Page }]

describe('MainLayout', () => {
  it('has the skip link first in the tab order, then the one main, and no other landmark', async () => {
    await renderWithApp(AppMainLayout, { routes })

    await userEvent.tab()

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    const main = screen.getByRole('main')
    expect(skip.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.queryByRole('banner')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })

  it('renders the routed page inside main, which is the skip link target', async () => {
    await renderWithApp(AppMainLayout, { routes })

    const main = screen.getByRole('main')

    expect(main).toHaveAttribute('id', 'main')
    expect(main).toHaveAttribute('tabindex', '-1')
    expect(within(main).getByRole('heading', { name: 'The page' })).toBeInTheDocument()
  })

  it('moves focus to main when the skip link is followed, without leaving the route', async () => {
    const { router } = await renderWithApp(AppMainLayout, { routes })

    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(router.currentRoute.value.hash).toBe('')
  })

  it('renders the toasts the notification store holds', async () => {
    await renderWithApp(AppMainLayout, { routes })

    useNotificationStore().showError('errors.unexpected')

    expect(
      (await screen.findAllByText('Something went wrong. Please try again.')).length,
    ).toBeGreaterThan(0)
  })

  it('applies the saved theme, because the layout owns the theme store', async () => {
    document.documentElement.removeAttribute('data-theme')

    await renderWithApp(AppMainLayout, { routes, initialState: { theme: { choice: 'dark' } } })

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
