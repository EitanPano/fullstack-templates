import { expect, test } from '@playwright/test'

import {
  HASHED,
  PASSWORD,
  expectSignedIn,
  fillSignIn,
  fillSignUp,
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
  await expect(page.getByRole('heading', { level: 1, name: '__PROJECT_DISPLAY_NAME__' })).toBeVisible()
  await expectSignedIn(page, email)
  await expectNoSeriousViolations(page)
})

// Until the page hydrates, a submit is the browser's own. The scripts never load here, so the form
// stays in that state: a GET form would put the password in the URL, in history and in access logs.
test('a form submitted before the page hydrates keeps its fields out of the URL', async ({ page }) => {
  await page.route('**/_next/static/**/*.js', (route) => route.abort())
  await page.goto('/sign-in')
  await (await visibleField(page, 'Email')).fill(uniqueEmail())
  await (await visibleField(page, 'Password', true)).fill(PASSWORD)
  const navigations: string[] = []
  page.on('request', (request) => {
    if (request.isNavigationRequest()) {
      navigations.push(`${request.method()} ${new URL(request.url()).search}`)
    }
  })

  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForLoadState()

  expect(navigations).toEqual(['POST '])
  expect(new URL(page.url()).search).toBe('')
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
  await expectSignedIn(page, email)
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
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
  await expectNoSeriousViolations(page)
})
