import { expect, test } from '@playwright/test'

import {
  HASHED,
  PASSWORD,
  closeAccountMenu,
  fillSignIn,
  fillSignUp,
  openAccountMenu,
  registerThroughUi,
  signOutThroughUi,
  uniqueEmail,
  visibleField,
} from './auth-support'
import { expectNoSeriousViolations } from './support'

// Every journey creates its own account, so none depends on the database's contents or on
// another journey. The server limits 10 registrations per address per 15 minutes; the suite
// sends six register requests (five accounts and one duplicate attempt), and the API under test
// scales its limits (RATE_LIMIT_SCALE).

test('sign up creates the account and lands signed in', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await fillSignUp(page, email)

  await expect(page).toHaveURL(/\/$/, HASHED)
  await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible()
  await openAccountMenu(page, email)
  await closeAccountMenu(page)
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
  await expectNoSeriousViolations(page)
})

// An action that ends in redirect() makes next-safe-action reject with Next's navigation error.
// The forms absorb it (ignoreNavigation); an unhandled one would land in the console, so this
// journey, which signs up, signs out and signs in, fails on any NEXT_REDIRECT error there.
test('sign out, then sign in again with the same account', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page.on('pageerror', (error) => problems.push(error.message))

  const email = await registerThroughUi(page)

  await signOutThroughUi(page, email)
  await expectNoSeriousViolations(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()

  await fillSignIn(page, email)

  await expect(page).toHaveURL(/\/$/, HASHED)
  await openAccountMenu(page, email)
  await closeAccountMenu(page)
  expect(problems.filter((text) => text.includes('NEXT_REDIRECT'))).toEqual([])
  await expectNoSeriousViolations(page)
})

test('a wrong password shows our copy and signs nobody in', async ({ page }) => {
  // An unknown email and a wrong password are the same 401 by design, so no account is needed.
  await page.goto('/sign-in')

  await fillSignIn(page, uniqueEmail(), `${PASSWORD} but wrong`)

  await expect(page.getByText('Email or password is wrong.')).toBeVisible()
  await expect(page.getByText("Can't reach the server")).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-in$/, HASHED)
  await expectNoSeriousViolations(page)
})

test('a taken email is shown on its field and not as a toast', async ({ page }) => {
  const email = await registerThroughUi(page)
  await signOutThroughUi(page, email)

  await page.goto('/sign-up')
  await fillSignUp(page, email)

  const field = await visibleField(page, 'Email')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'already registered' })).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-up$/, HASHED)
  await expectNoSeriousViolations(page)
})

test('a signed-in account is kept out of the sign-in screen', async ({ page }) => {
  await registerThroughUi(page)

  await page.goto('/sign-in')

  await expect(page).toHaveURL(/\/$/, HASHED)
})

test('a guarded page sends a visitor to sign-in and back after signing in', async ({ page }) => {
  const email = await registerThroughUi(page)
  await signOutThroughUi(page, email)

  await page.goto('/profile')

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/)
  // The URL changes before the sign-in page has replaced the redirecting document.
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await fillSignIn(page, email)

  await expect(page).toHaveURL(/\/profile$/, HASHED)
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  // The scan waits for the account slot to settle, or it would scan the skeleton.
  await expect(page.getByRole('button', { name: /^Account menu/ })).toBeVisible()
  await expectNoSeriousViolations(page)
})
