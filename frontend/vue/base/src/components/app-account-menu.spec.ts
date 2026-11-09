import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { setSessionHint, hasSessionHint } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { envelope, USER } from '@/testing/auth-fixtures'
import { renderWithApp } from '@/testing/render'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import AppAccountMenu from './app-account-menu.vue'

const routes = [
  { path: '/', component: Page },
  { path: '/profile', component: Page },
  { path: '/auth/login', component: Page },
]

const SIGNED_IN = { auth: { user: USER } }

describe('AccountMenu', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('offers a visitor a link to sign in and nothing else', async () => {
    await renderWithApp(AppAccountMenu, { routes })

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login')
    expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
  })

  it('shows an account an avatar button, named by its label alone and closed', async () => {
    await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })

    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).not.toHaveAttribute('aria-controls')
    expect(trigger.querySelector('.avatar')).toHaveAttribute('data-initials', 'AD')
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('opens a panel with the email, the profile link and sign out', async () => {
    await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })

    const trigger = screen.getByRole('button', { name: 'Account menu' })
    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', 'account-menu')
    const panel = screen.getByRole('group', { name: 'Account menu' })
    expect(panel).toHaveAttribute('id', 'account-menu')
    expect(screen.getByText(USER.email)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/profile')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('closes on Escape and returns the focus to the trigger', async () => {
    await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    await userEvent.click(trigger)
    screen.getByRole('link', { name: 'Profile' }).focus()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('group', { name: 'Account menu' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes when focus leaves the menu', async () => {
    await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    await userEvent.click(document.body)

    expect(screen.queryByRole('group', { name: 'Account menu' })).not.toBeInTheDocument()
  })

  it('closes after the profile link is followed', async () => {
    const { router } = await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    await userEvent.click(screen.getByRole('link', { name: 'Profile' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/profile')
    expect(screen.queryByRole('group', { name: 'Account menu' })).not.toBeInTheDocument()
  })

  it('signs out through the API, clears the hint and goes home', async () => {
    setSessionHint()
    stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })
    const { router } = await renderWithApp(AppAccountMenu, {
      routes,
      route: '/profile',
      initialState: SIGNED_IN,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/')
    expect(useAuthStore().isLoggedIn).toBe(false)
    expect(hasSessionHint()).toBe(false)
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('stays signed in, on the page, when sign-out fails', async () => {
    setSessionHint()
    stubApi({ 'POST /api/auth/logout': envelope('internal', 500) })
    const { router } = await renderWithApp(AppAccountMenu, {
      routes,
      route: '/profile',
      initialState: SIGNED_IN,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await expect
      .poll(() => useNotificationStore().toasts.map((toast) => toast.messageKey))
      .toEqual(['errors.internal'])
    expect(router.currentRoute.value.path).toBe('/profile')
    expect(useAuthStore().isLoggedIn).toBe(true)
  })

  it('swaps to the sign-in link when the session is lost under it', async () => {
    await renderWithApp(AppAccountMenu, { routes, initialState: SIGNED_IN })

    useAuthStore().forget()

    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
