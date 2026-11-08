import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { renderWithApp } from '@/testing/render'

import { profileForm } from './user.form'

async function formOf() {
  let form: ReturnType<typeof profileForm> | undefined
  await renderWithApp(
    defineComponent({
      setup() {
        form = profileForm()
        return () => null
      },
    }),
  )
  if (form === undefined) throw new Error('setup did not run')
  return form
}

describe('profileForm', () => {
  it('submits an E.164 phone number', async () => {
    const form = await formOf()
    form.values.phone = '+14155550132'
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).toHaveBeenCalledWith({ phone: '+14155550132' })
  })

  it('accepts an empty control: it means remove the number', async () => {
    const form = await formOf()
    const handler = vi.fn()

    await form.submit(handler)

    expect(handler).toHaveBeenCalledWith({ phone: '' })
  })

  it.each(['0123', '+0123', '14155550132', 'phone', '+1 415 555 0132'])(
    'refuses %j, by the generated schema',
    async (phone) => {
      const form = await formOf()
      form.values.phone = phone
      const handler = vi.fn()

      await form.submit(handler)

      expect(handler).not.toHaveBeenCalled()
      expect(form.errorText('phone')).toBeTruthy()
    },
  )
})
