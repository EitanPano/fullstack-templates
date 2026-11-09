import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { renderWithApp } from '@/testing/render'

import { loginForm, otpForm, registerForm } from './auth.form'

// Runs a form factory inside a component's setup, where useZodForm needs the app's i18n.
async function formOf<T>(make: () => T): Promise<T> {
  let form: T | undefined
  await renderWithApp(
    defineComponent({
      setup() {
        form = make()
        return () => null
      },
    }),
  )
  if (form === undefined) throw new Error('setup did not run')
  return form
}

const PASSWORD = 'a-long-password'

describe('loginForm', () => {
  it('submits the parsed credentials when both fields hold', async () => {
    const form = await formOf(loginForm)
    form.values.email = 'ada@example.com'
    form.values.password = PASSWORD
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).toHaveBeenCalledWith({ email: 'ada@example.com', password: PASSWORD })
  })

  it('calls nothing and shows the contract rules when the form is empty', async () => {
    const form = await formOf(loginForm)
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).not.toHaveBeenCalled()
    expect(form.errorText('password')).toBe('Enter at least 8 characters')
  })

  it('takes the password length from the generated schema, not a copy', async () => {
    const form = await formOf(loginForm)
    form.values.email = 'ada@example.com'
    form.values.password = '1234567'

    await form.submit(vi.fn())

    expect(form.errorText('password')).toBe('Enter at least 8 characters')
    expect(form.errorText('email')).toBeUndefined()
  })

  it('refuses an address longer than the contract allows', async () => {
    const form = await formOf(loginForm)
    form.values.email = `${'a'.repeat(250)}@b.co`
    form.values.password = PASSWORD

    await form.submit(vi.fn())

    expect(form.errorText('email')).toBe('Enter at most 254 characters')
  })
})

describe('registerForm', () => {
  it('submits the credentials without the confirm field', async () => {
    const form = await formOf(registerForm)
    form.values.email = 'ada@example.com'
    form.values.password = PASSWORD
    form.values.confirm = PASSWORD
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).toHaveBeenCalledWith({ email: 'ada@example.com', password: PASSWORD })
  })

  it('puts errors.match on the confirm field when the passwords differ', async () => {
    const form = await formOf(registerForm)
    form.values.email = 'ada@example.com'
    form.values.password = PASSWORD
    form.values.confirm = 'something-else-1'
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).not.toHaveBeenCalled()
    expect(form.errorText('confirm')).toBe('The values do not match')
  })
})

describe('otpForm', () => {
  it('accepts six digits', async () => {
    const form = await formOf(otpForm)
    form.values.code = '123456'
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).toHaveBeenCalledWith({ code: '123456' })
  })

  it.each(['12345', '1234567', 'abcdef', ''])('refuses %j', async (code) => {
    const form = await formOf(otpForm)
    form.values.code = code
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).not.toHaveBeenCalled()
    expect(form.errorText('code')).toBeTruthy()
  })
})
