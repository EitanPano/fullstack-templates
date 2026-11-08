import { describe, expect, it } from 'vitest'

import { authGuard } from '@/core/guards/auth.guard'
import { guestGuard } from '@/core/guards/guest.guard'

import routes from './auth.routes'

const byPath = (path: string) => routes.find((route) => route.path === path)

describe('auth routes', () => {
  it('sends the bare /auth to login', () => {
    expect(byPath('')?.redirect).toBe('/auth/login')
  })

  it('keeps login and register for visitors, titled', () => {
    expect(byPath('login')?.beforeEnter).toBe(guestGuard)
    expect(byPath('login')?.meta?.titleKey).toBe('auth.login.title')
    expect(byPath('register')?.beforeEnter).toBe(guestGuard)
    expect(byPath('register')?.meta?.titleKey).toBe('auth.register.title')
  })

  it('puts verify-otp behind authGuard: the OTP calls need a session', () => {
    expect(byPath('verify-otp')?.beforeEnter).toBe(authGuard)
    expect(byPath('verify-otp')?.meta?.titleKey).toBe('auth.otp.title')
  })

  it('loads every page lazily', () => {
    for (const route of routes.filter((entry) => entry.redirect === undefined)) {
      expect(typeof route.component).toBe('function')
    }
  })
})
