import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { useNotificationStore } from '@/store/notification.store'
import { envelope, USER } from '@/testing/auth-fixtures'
import { renderWithApp } from '@/testing/render'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import VerifyOtpPage from './verify-otp-page.vue'

const routes = [
  { path: '/', component: Page },
  { path: '/profile', component: Page },
  { path: '/auth/verify-otp', component: VerifyOtpPage },
]

const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)
const SIGNED_IN = { auth: { user: USER } }

async function open() {
  return renderWithApp(VerifyOtpPage, {
    route: '/auth/verify-otp',
    routes,
    initialState: SIGNED_IN,
  })
}

describe('VerifyOtpPage', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('names the address and offers to send the code first', async () => {
    await open()

    expect(screen.getByRole('heading', { level: 1, name: 'Verify your email' })).toBeInTheDocument()
    expect(screen.getByText(`We will send a six-digit code to ${USER.email}.`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
  })

  it('sends the code, toasts that it was sent and shows the code field', async () => {
    stubApi({ 'POST /api/auth/otp': Response.json({}, { status: 202 }) })
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument()
    expect(toastKeys()).toEqual(['auth.otp.sent'])
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeInTheDocument()
  })

  it('stays on the first step when sending fails', async () => {
    stubApi({ 'POST /api/auth/otp': envelope('rate_limited', 429) })
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))

    await expect.poll(toastKeys).toEqual(['errors.rate_limited'])
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
  })

  it('verifies the code and goes to the profile', async () => {
    stubApi({
      'POST /api/auth/otp': Response.json({}, { status: 202 }),
      'POST /api/auth/otp/verification': Response.json({
        user: { ...USER, emailVerifiedAt: '2026-01-02T00:00:00.000Z' },
      }),
    })
    const { router } = await open()

    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await userEvent.type(await screen.findByLabelText('Verification code'), '123456')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/profile')
    expect(toastKeys()).toEqual(['auth.otp.sent', 'auth.otp.verified'])
  })

  it('refuses a code that is not six digits and sends nothing', async () => {
    const fetchMock = stubApi({ 'POST /api/auth/otp': Response.json({}, { status: 202 }) })
    await open()

    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await userEvent.type(await screen.findByLabelText('Verification code'), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(screen.getByLabelText('Verification code')).toHaveAttribute('aria-invalid', 'true')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('puts a wrong code (422) on the code field', async () => {
    stubApi({
      'POST /api/auth/otp': Response.json({}, { status: 202 }),
      'POST /api/auth/otp/verification': envelope('validation_failed', 422, [
        { path: 'code', message: 'x' },
      ]),
    })
    const { router } = await open()

    await userEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await userEvent.type(await screen.findByLabelText('Verification code'), '000000')
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('This value is not valid')).toBeInTheDocument()
    expect(router.currentRoute.value.path).toBe('/auth/verify-otp')
    expect(toastKeys()).toEqual(['auth.otp.sent'])
  })
})
