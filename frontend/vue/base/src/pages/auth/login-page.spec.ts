import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { hasSessionHint } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { envelope, SESSION, USER } from '@/testing/auth-fixtures'
import { renderWithApp } from '@/testing/render'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import LoginPage from './login-page.vue'

const routes = [
  { path: '/', component: Page },
  { path: '/profile', component: Page },
  { path: '/auth/login', component: LoginPage },
  { path: '/auth/register', component: Page },
]

const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)

async function open(route = '/auth/login') {
  const view = await renderWithApp(LoginPage, { route, routes })
  return view
}

async function fill(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
}

describe('LoginPage', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the sign-in card with the email focused and a link to create an account', async () => {
    // The test renderer attaches the tree after it mounts, where a real focus has no effect, so the
    // call to focus is what is observed.
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    await open()

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(focus.mock.contexts).toContain(screen.getByLabelText('Email'))
    focus.mockRestore()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/auth/register',
    )
  })

  it('carries next to the register link', async () => {
    await open('/auth/login?next=%2Fprofile')

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/auth/register?next=/profile',
    )
  })

  it('shows the contract rules on submit and sends nothing while the form is invalid', async () => {
    const fetchMock = stubApi({})
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter at least 8 characters')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs in, sets the hint and goes to the page it was sent away from', async () => {
    stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    const { router } = await open('/auth/login?next=%2Fprofile')

    await fill(USER.email, 'a-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/profile')
    expect(useAuthStore().user).toEqual(USER)
    expect(hasSessionHint()).toBe(true)
    expect(toastKeys()).toEqual([])
  })

  it('goes home when there is no next', async () => {
    stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
    const { router } = await open()

    await fill(USER.email, 'a-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/')
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example'])(
    'goes home, never to %s, when next is not a path on this site',
    async (next) => {
      stubApi({ 'POST /api/auth/login': Response.json(SESSION) })
      const { router } = await open(`/auth/login?next=${encodeURIComponent(next)}`)

      await fill(USER.email, 'a-long-password')
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

      await expect.poll(() => router.currentRoute.value.path).toBe('/')
    },
  )

  it('words a wrong password through a toast and stays on the form', async () => {
    stubApi({ 'POST /api/auth/login': envelope('unauthenticated', 401) })
    const { router } = await open()

    await fill(USER.email, 'a-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await expect.poll(toastKeys).toEqual(['auth.login.invalid'])
    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(hasSessionHint()).toBe(false)
  })

  it('puts a server validation failure on its field and toasts nothing', async () => {
    stubApi({
      'POST /api/auth/login': envelope('validation_failed', 422, [
        { path: 'email', message: 'server text' },
      ]),
    })
    await open()

    await fill(USER.email, 'a-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('This value is not valid')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(toastKeys()).toEqual([])
  })

  it('toasts once for a validation failure that names no field', async () => {
    stubApi({
      'POST /api/auth/login': envelope('validation_failed', 422, [
        { path: 'nowhere', message: 'x' },
      ]),
    })
    await open()

    await fill(USER.email, 'a-long-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await expect.poll(toastKeys).toEqual(['errors.validation_failed'])
  })
})
