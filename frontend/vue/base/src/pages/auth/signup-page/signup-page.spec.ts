import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { hasSessionHint } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { envelope, SESSION, USER } from '@/testing/auth-fixtures'
import { renderWithApp } from '@/testing/render'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import SignupPage from './signup-page.vue'

const routes = [
  { path: '/', component: Page },
  { path: '/profile', component: Page },
  { path: '/auth/login', component: Page },
  { path: '/auth/signup', component: SignupPage },
]

const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)
const PASSWORD = 'a-long-password'

async function fill(email: string, password: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.type(screen.getByLabelText('Confirm password'), confirm)
}

describe('SignupPage', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the card with a link to sign in', async () => {
    await renderWithApp(SignupPage, { route: '/auth/signup', routes })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/login')
  })

  it('creates the account, signs it in and sends only the credentials', async () => {
    const fetchMock = stubApi({
      'POST /api/auth/signup': Response.json(SESSION, { status: 201 }),
    })
    const { router } = await renderWithApp(SignupPage, { route: '/auth/signup', routes })

    await fill(USER.email, PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/')
    expect(useAuthStore().user).toEqual(USER)
    expect(hasSessionHint()).toBe(true)
    const request = fetchMock.mock.calls[0]?.[0] as unknown as Request
    expect(await request.clone().json()).toEqual({ email: USER.email, password: PASSWORD })
  })

  it('follows next after signing up', async () => {
    stubApi({ 'POST /api/auth/signup': Response.json(SESSION, { status: 201 }) })
    const { router } = await renderWithApp(SignupPage, {
      route: '/auth/signup?next=%2Fprofile',
      routes,
    })

    await fill(USER.email, PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/profile')
  })

  it('puts errors.match on the confirm field and sends nothing', async () => {
    const fetchMock = stubApi({})
    await renderWithApp(SignupPage, { route: '/auth/signup', routes })

    await fill(USER.email, PASSWORD, 'another-password')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByText('The values do not match')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('puts a taken address on the email field and stays', async () => {
    stubApi({ 'POST /api/auth/signup': envelope('conflict', 409) })
    const { router } = await renderWithApp(SignupPage, { route: '/auth/signup', routes })

    await fill(USER.email, PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('An account with this email already exists.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(toastKeys()).toEqual([])
    expect(router.currentRoute.value.path).toBe('/auth/signup')
    expect(hasSessionHint()).toBe(false)

    await userEvent.type(screen.getByLabelText('Email'), 'x')

    expect(screen.queryByText('An account with this email already exists.')).not.toBeInTheDocument()
  })

  it('puts a server validation failure on its field', async () => {
    stubApi({
      'POST /api/auth/signup': envelope('validation_failed', 422, [
        { path: 'password', message: 'x' },
      ]),
    })
    await renderWithApp(SignupPage, { route: '/auth/signup', routes })

    await fill(USER.email, PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('This value is not valid')).toBeInTheDocument()
    expect(toastKeys()).toEqual([])
  })
})
