import { expect, test } from '@playwright/test'

import {
  PASSWORD,
  expectSignedIn,
  fillSignIn,
  fillSignUp,
  signupThroughUi,
  signOutThroughUi,
  uniqueEmail,
} from './auth-support'
import { expectNoSeriousViolations } from './support'

// Every journey creates its own account, so none depends on the database's contents or on
// another journey. The server limits 10 registrations per address per 15 minutes; the suite sends
// six signup requests (five accounts and one duplicate attempt), and the API under test scales
// its limits (RATE_LIMIT_SCALE).

test('sign up creates the account and lands signed in', async ({ page }) => {
  const email = uniqueEmail()
  await page.goto('/sign-up')
  await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
  await expectNoSeriousViolations(page)

  await fillSignUp(page, email)

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' })).toBeVisible()
  await expectSignedIn(page, email)
  await expectNoSeriousViolations(page)
})

test('sign out, then sign in again with the same account', async ({ page }) => {
  const email = await signupThroughUi(page)

  await signOutThroughUi(page, email)
  await expectNoSeriousViolations(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()

  await fillSignIn(page, email)

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expectSignedIn(page, email)
  await expectNoSeriousViolations(page)
})

test('a wrong password shows our copy and signs nobody in', async ({ page }) => {
  // An unknown email and a wrong password are the same 401 by design, so no account is needed.
  await page.goto('/sign-in')

  await fillSignIn(page, uniqueEmail(), `${PASSWORD} but wrong`)

  await expect(page.getByText('Email or password is wrong.')).toBeVisible()
  await expect(page.getByText("Can't reach the server")).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15_000 })
  await expectNoSeriousViolations(page)
})

test('a taken email is shown on its field and not as a toast', async ({ page }) => {
  const email = await signupThroughUi(page)
  await signOutThroughUi(page, email)

  await page.goto('/sign-up')
  await fillSignUp(page, email)

  const field = page.getByLabel('Email')
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert').filter({ hasText: 'already registered' })).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await expect(page).toHaveURL(/\/sign-up$/, { timeout: 15_000 })
  await expectNoSeriousViolations(page)
})

test('a signed-in account is kept out of the sign-in screen', async ({ page }) => {
  await signupThroughUi(page)

  await page.goto('/sign-in')

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
})

test('a guarded page sends a visitor to sign-in and back after signing in', async ({ page }) => {
  const email = await signupThroughUi(page)
  await signOutThroughUi(page, email)

  await page.goto('/profile')

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/, { timeout: 15_000 })
  await expectNoSeriousViolations(page)

  await fillSignIn(page, email)

  await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
  await expectNoSeriousViolations(page)
})
