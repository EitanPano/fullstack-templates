import { expect, type Page } from '@playwright/test'

import { STORAGE_KEYS } from '../../src/core/config/constants'

import { uniqueEmail } from './support'

export const PASSWORD = 'correct horse battery staple'

// Signs up through the API, which sets the session cookies on the page's browser context, and
// plants the session hint the app reads at start-up (the localStorage value the storage provider
// writes: the JSON string "1"). Call it before the first goto. The screens and the journeys that
// are not about the form use it, so the signup route's rate limit is spent once per account.
export async function signupThroughApi(page: Page, run: string): Promise<string> {
  const email = uniqueEmail(run)
  const response = await page.request.post('/api/auth/signup', {
    data: { email, password: PASSWORD },
  })
  expect(response.ok(), `signup ${email}: ${String(response.status())}`).toBe(true)
  await page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value)
    },
    [STORAGE_KEYS.sessionHint, JSON.stringify('1')] as const,
  )
  return email
}

export async function fillSignUp(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
}

export async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// The signup form, then the profile page, which names the account.
export async function signupThroughUi(page: Page, run: string): Promise<string> {
  const email = uniqueEmail(run)
  await page.goto('/auth/signup')
  await fillSignUp(page, email)
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await expectSignedIn(page, email)
  return email
}

// The profile page is where an account reads its own session: it names the email. A visitor is
// sent to sign-in instead, so a visible email means signed in. Scoped to main, so a toast or any
// other text outside it cannot satisfy the check.
export async function expectSignedIn(page: Page, email: string) {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible()
  await expect(page.getByRole('main').getByText(email)).toBeVisible()
}

// Signs out with the profile page's button, which sends the visitor home, then checks the session
// is gone: a guarded page now asks for sign-in.
export async function signOutThroughUi(page: Page, email: string) {
  await expectSignedIn(page, email)
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 })
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/auth\/login\?next=(%2F|\/)profile$/, { timeout: 15_000 })
}
