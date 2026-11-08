import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

import { DISPLAY_NAME } from '@/core/config/constants'
import { useNotificationStore } from '@/store/notification.store'
import { renderWithApp } from '@/testing/render'
import { Page } from '@/testing/stubs'

import AuthLayout from './auth-layout.vue'

// The layout is a route component, so the host is the router's outlet.
const Host = defineComponent({ render: () => h(RouterView) })

const routes = [
  { path: '/', component: Page },
  { path: '/auth', component: AuthLayout, children: [{ path: 'login', component: Page }] },
]

describe('AuthLayout', () => {
  it('has the skip link first, then the brand, one main and the footer, and no shell', async () => {
    await renderWithApp(Host, { route: '/auth/login', routes })

    await userEvent.tab()

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
    expect(screen.getByRole('link', { name: DISPLAY_NAME })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders the child route inside main', async () => {
    await renderWithApp(Host, { route: '/auth/login', routes })

    expect(screen.getByRole('main')).toHaveTextContent('The page')
  })

  it('moves the focus to main from the skip link without changing the URL', async () => {
    const { router } = await renderWithApp(Host, { route: '/auth/login', routes })

    await userEvent.click(screen.getByRole('link', { name: 'Skip to content' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(router.currentRoute.value.fullPath).toBe('/auth/login')
  })

  it('shows the toasts of the screens it frames', async () => {
    await renderWithApp(Host, { route: '/auth/login', routes })

    useNotificationStore().showError('auth.login.invalid')

    expect(await screen.findByText('The email or password is incorrect.')).toBeInTheDocument()
  })
  it('applies the saved theme, though the frame has no header to own the theme store', async () => {
    document.documentElement.removeAttribute('data-theme')

    await renderWithApp(Host, {
      route: '/auth/login',
      routes,
      initialState: { theme: { choice: 'dark' } },
    })

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
