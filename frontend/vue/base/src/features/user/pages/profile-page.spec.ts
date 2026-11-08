import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { RouterView } from 'vue-router'

import { installInterceptors } from '@/core/interceptors/http.provider'
import { hasSessionHint, setSessionHint } from '@/core/providers/session'
import { useAuthStore } from '@/store/auth.store'
import { useNotificationStore } from '@/store/notification.store'
import { useUserStore } from '@/store/user.store'
import { ADMIN, envelope, USER } from '@/testing/auth-fixtures'
import { renderWithApp } from '@/testing/render'
import { stubApi } from '@/testing/stub-api'
import { Page } from '@/testing/stubs'

import ProfilePage from './profile-page.vue'

// The page leaves through the router, so it is rendered as a route, in an outlet.
const Host = defineComponent({ render: () => h(RouterView) })

const routes = [
  { path: '/', component: Page },
  { path: '/profile', component: ProfilePage },
  { path: '/auth/verify-otp', component: Page },
]

const SIGNED_IN = { auth: { user: USER } }
const toastKeys = () => useNotificationStore().toasts.map((toast) => toast.messageKey)

async function open(profile: Record<string, unknown> = USER) {
  const fetchMock = stubApi({ 'GET /api/user/me': Response.json(profile) })
  const view = await renderWithApp(Host, { route: '/profile', routes, initialState: SIGNED_IN })
  await screen.findByText(String(profile['email']))
  return { ...view, fetchMock }
}

describe('ProfilePage', () => {
  beforeAll(() => {
    installInterceptors()
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('shows a busy status region while the profile loads', async () => {
    stubApi({ 'GET /api/user/me': () => new Promise<Response>(() => undefined) })
    await renderWithApp(Host, { route: '/profile', routes, initialState: SIGNED_IN })

    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
  })

  it('lists the email, the role, when it was created and that it is not verified', async () => {
    await open()

    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.getByText('Account created')).toBeInTheDocument()
    expect(screen.getByText('Not verified')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Verify now' })).toHaveAttribute(
      'href',
      '/auth/verify-otp',
    )
  })

  it('reads the role label of an admin and shows a verified address without the verify link', async () => {
    await open({ ...ADMIN, emailVerifiedAt: '2026-01-02T00:00:00.000Z' })
    // The page reads the profile it loaded, not the session's account.
    expect(await screen.findByText('Administrator')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Verify now' })).not.toBeInTheDocument()
  })

  it('fills the phone field from the profile', async () => {
    await open({ ...USER, phone: '+14155550132' })

    expect(await screen.findByLabelText('Phone number')).toHaveValue('+14155550132')
  })

  it('shows the error state with a retry when the load fails', async () => {
    stubApi({ 'GET /api/user/me': envelope('internal', 500) })
    await renderWithApp(Host, { route: '/profile', routes, initialState: SIGNED_IN })

    expect(
      await screen.findByText('Something went wrong on our side. Try again.'),
    ).toBeInTheDocument()
    stubApi({ 'GET /api/user/me': Response.json(USER) })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(USER.email)).toBeInTheDocument()
  })

  it('saves the phone number and toasts that the profile is saved', async () => {
    const { fetchMock } = await open()
    stubApi({ 'PATCH /api/user/me': Response.json({ ...USER, phone: '+14155550132' }) })

    await userEvent.type(screen.getByLabelText('Phone number'), '+14155550132')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect.poll(toastKeys).toEqual(['profile.saved'])
    expect(useUserStore().profile?.phone).toBe('+14155550132')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('sends null when the field is emptied: that removes the number', async () => {
    await open({ ...USER, phone: '+14155550132' })
    const patch = stubApi({ 'PATCH /api/user/me': Response.json({ ...USER, phone: null }) })

    await userEvent.clear(await screen.findByLabelText('Phone number'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect.poll(toastKeys).toEqual(['profile.saved'])
    const request = patch.mock.calls[0]?.[0] as unknown as Request
    expect(await request.clone().json()).toEqual({ phone: null })
  })

  it('refuses a phone number that is not E.164 and sends nothing', async () => {
    await open()
    const patch = stubApi({})

    await userEvent.type(screen.getByLabelText('Phone number'), '0123')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true')
    expect(patch).not.toHaveBeenCalled()
  })

  it('puts a server validation failure on the phone field', async () => {
    await open()
    stubApi({
      'PATCH /api/user/me': envelope('validation_failed', 422, [{ path: 'phone', message: 'x' }]),
    })

    await userEvent.type(screen.getByLabelText('Phone number'), '+14155550132')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('This value is not valid')).toBeInTheDocument()
    expect(toastKeys()).toEqual([])
  })

  it('signs out from the header action and goes home', async () => {
    setSessionHint()
    const { router } = await open()
    stubApi({ 'POST /api/auth/logout': new Response(null, { status: 204 }) })

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    await expect.poll(() => router.currentRoute.value.path).toBe('/')
    expect(useAuthStore().isLoggedIn).toBe(false)
    expect(hasSessionHint()).toBe(false)
    expect(useUserStore().profile).toBeNull()
  })

  it('asks before leaving with an unsaved phone number, and stays when told to', async () => {
    const { router } = await open()
    await userEvent.type(screen.getByLabelText('Phone number'), '+1415')

    const navigation = router.push('/')
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await navigation

    expect(router.currentRoute.value.path).toBe('/profile')
  })

  it('leaves when the question is answered with Leave', async () => {
    const { router } = await open()
    await userEvent.type(screen.getByLabelText('Phone number'), '+1415')

    const navigation = router.push('/')
    await screen.findByText('Leave without saving?')
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await navigation

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('does not ask after sign-out, although the field still holds the typed number', async () => {
    const { router } = await open()
    await userEvent.type(screen.getByLabelText('Phone number'), '+1415')
    useAuthStore().forget()

    await router.push('/')

    expect(router.currentRoute.value.path).toBe('/')
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument()
  })

  it('leaves without a question when nothing was edited', async () => {
    const { router } = await open()

    await router.push('/')

    expect(router.currentRoute.value.path).toBe('/')
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument()
  })
})
