import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'

import { AuthStore } from '@app/store/auth.store'

import { authGuard, guestGuard } from './auth.guard'
import { roleGuard } from './role.guard'

@Component({ template: '' })
class PageComponent {}

// The guards run in real navigations over a small route table, with the store replaced by signals.
describe('route guards', () => {
  const roles = signal<readonly string[]>([])
  const signedIn = signal(false)

  async function navigate(url: string): Promise<string> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: PageComponent },
          { path: 'profile', canMatch: [authGuard], component: PageComponent },
          { path: 'auth/login', canMatch: [guestGuard], component: PageComponent },
          { path: 'forbidden', component: PageComponent },
          {
            path: 'admin',
            canMatch: [roleGuard],
            data: { roles: ['admin'] },
            component: PageComponent,
          },
          { path: 'any-account', canMatch: [roleGuard], component: PageComponent },
        ]),
        { provide: AuthStore, useValue: { isLoggedIn: signedIn, roles } },
      ],
    })
    const router = TestBed.inject(Router)
    await router.navigateByUrl(url)
    return router.url
  }

  beforeEach(() => {
    signedIn.set(false)
    roles.set([])
  })

  describe('authGuard', () => {
    it('sends a visitor to login, carrying the attempted path and query as next', async () => {
      const url = await navigate('/profile?tab=2')
      expect(url).toBe('/auth/login?next=%2Fprofile%3Ftab%3D2')
    })

    it('lets an account through', async () => {
      signedIn.set(true)
      expect(await navigate('/profile?tab=2')).toBe('/profile?tab=2')
    })
  })

  describe('guestGuard', () => {
    it('lets a visitor see the login screen', async () => {
      expect(await navigate('/auth/login')).toBe('/auth/login')
    })

    it('sends a signed-in account home', async () => {
      signedIn.set(true)
      expect(await navigate('/auth/login')).toBe('/')
    })
  })

  describe('roleGuard', () => {
    it('sends a visitor to login with next', async () => {
      expect(await navigate('/admin')).toBe('/auth/login?next=%2Fadmin')
    })

    it('sends an account with the wrong role to /forbidden', async () => {
      signedIn.set(true)
      roles.set(['user'])
      expect(await navigate('/admin')).toBe('/forbidden')
    })

    it('lets an account with the role through', async () => {
      signedIn.set(true)
      roles.set(['admin'])
      expect(await navigate('/admin')).toBe('/admin')
    })

    it('treats a route with no data.roles as open to any account', async () => {
      signedIn.set(true)
      roles.set(['user'])
      expect(await navigate('/any-account')).toBe('/any-account')
    })
  })
})
