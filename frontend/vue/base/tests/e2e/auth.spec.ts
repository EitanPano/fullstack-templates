import { expect, test } from '@playwright/test'

import {
  PASSWORD,
  fillSignIn,
  fillSignUp,
  expectSignedIn,
  registerThroughApi,
  registerThroughUi,
  signOutThroughUi,
} from './auth-support'
import { expectNoAxeViolations, uniqueEmail } from './support'

// Every journey creates its own account, so none depends on the database's contents or on another
// journey. The server limits registrations per address (10 per 15 minutes), so a journey that is
// not about the form signs up through the API; the API under test scales its limits
// (RATE_LIMIT_SCALE). This file runs on the phone project only.

test('sign up creates the account and lands signed in', async ({ page }) => {
  const email = uniqueEmail('sign-up')
  await page.goto('/auth/register')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await expectNoAxeViolations(page)

  await fillSignUp(page, email)

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(
    page.getByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' }),
  ).toBeVisible()
  await expectNoAxeViolations(page)
  await expectSignedIn(page, email)
})

test('sign in, see the profile, sign out', async ({ page }) => {
  const email = await registerThroughUi(page, 'profile')
  await signOutThroughUi(page, email)

  await page.goto('/auth/login')
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expectNoAxeViolations(page)
  await fillSignIn(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })

  await expectSignedIn(page, email)
  await expect(page.locator('.profile__fact', { hasText: 'Email' }).first()).toContainText(email)
  await expectNoAxeViolations(page)

  await signOutThroughUi(page, email)
})

test('a wrong password shows our copy and signs nobody in', async ({ page }) => {
  // An unknown email and a wrong password are the same 401 by design, so no account is needed.
  await page.goto('/auth/login')

  await fillSignIn(page, uniqueEmail('wrong'), `${PASSWORD} but wrong`)

  await expect(
    page.locator('.toast__message', { hasText: 'The email or password is incorrect.' }),
  ).toBeVisible()
  await expect(page.getByText('Cannot reach the server')).toHaveCount(0)
  await expect(page).toHaveURL(/\/auth\/login$/)
  await expectNoAxeViolations(page)
})

test('a taken email is refused on its field and the visitor stays on the form', async ({
  page,
}) => {
  const email = await registerThroughApi(page, 'taken')
  // The account exists; a visitor tries to register it again.
  await page.context().clearCookies()
  await page.addInitScript(() => {
    localStorage.clear()
  })
  await page.goto('/auth/register')

  await fillSignUp(page, email)

  await expect(
    page.locator('.form-field__error', { hasText: 'An account with this email already exists.' }),
  ).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.toast__message')).toHaveCount(0)
  await expect(page).toHaveURL(/\/auth\/register$/)
  await expectNoAxeViolations(page)
})

test('the form checks its fields before it sends anything', async ({ page }) => {
  await page.goto('/auth/register')
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/')) sent.push(request.url())
  })

  await fillSignUp(page, uniqueEmail('short'), 'short')

  await expect(page.getByText('Enter at least 8 characters')).toBeVisible()
  expect(sent).toEqual([])
  await expectNoAxeViolations(page)
})

test('a guarded page sends a visitor to sign in and back after signing in', async ({ page }) => {
  const email = await registerThroughApi(page, 'guard')
  // The account exists; forget its session so the visitor is signed out.
  await page.context().clearCookies()
  await page.addInitScript(() => {
    localStorage.clear()
  })

  await page.goto('/profile')

  await expect(page).toHaveURL(/\/auth\/login\?next=(%2F|\/)profile$/, { timeout: 15_000 })
  await expectNoAxeViolations(page)

  await fillSignIn(page, email)

  await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible()
  await expect(page.locator('.profile__facts')).toContainText(email)
  await expectNoAxeViolations(page)
})

test('a signed-in visitor on the sign-in screen is sent home', async ({ page }) => {
  const email = await registerThroughApi(page, 'guest')

  await page.goto('/auth/login')

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expectSignedIn(page, email)
})
