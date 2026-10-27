import { describe, expect, it, vi } from 'vitest'

import { ignoreNavigation, unplacedMessage } from '@/shared/ui/form/action-form'

const navigation = (digest: string) => Object.assign(new Error(digest), { digest })

describe('ignoreNavigation', () => {
  it.each(['NEXT_REDIRECT;push;/;307;', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404'])(
    'swallows the navigation error %s',
    async (digest) => {
      const submit = ignoreNavigation(() => Promise.reject(navigation(digest)))

      await expect(submit()).resolves.toBeUndefined()
    },
  )

  it('rethrows an error that is not a navigation', async () => {
    const boom = new Error('boom')
    const submit = ignoreNavigation(() => Promise.reject(boom))

    await expect(submit()).rejects.toBe(boom)
  })

  it('rethrows an error whose digest is not a navigation one', async () => {
    const other = navigation('SOMETHING_ELSE')
    const submit = ignoreNavigation(() => Promise.reject(other))

    await expect(submit()).rejects.toBe(other)
  })

  it('passes the event through', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)

    await ignoreNavigation(handler)({ type: 'submit' } as never)

    expect(handler).toHaveBeenCalledWith({ type: 'submit' })
  })
})

describe('unplacedMessage', () => {
  const registered =
    (...names: string[]) =>
    (path: string) =>
      names.includes(path)

  it('is undefined when there are no validation errors', () => {
    expect(unplacedMessage(undefined, registered('email'))).toBeUndefined()
  })

  it('is undefined when every error sits on a form field', () => {
    const errors = { email: { _errors: ['Taken.'] } }

    expect(unplacedMessage(errors, registered('email'))).toBeUndefined()
  })

  it('returns the message of an error on a field the form does not have', () => {
    const errors = { nickname: { _errors: ['Pick another.'] } }

    expect(unplacedMessage(errors, registered('email'))).toBe('Pick another.')
  })

  it('stays silent when at least one error sits on a form field', () => {
    const errors = { email: { _errors: ['Taken.'] }, nickname: { _errors: ['Pick another.'] } }

    expect(unplacedMessage(errors, registered('email'))).toBeUndefined()
  })

  it('reads nested paths and root errors', () => {
    expect(
      unplacedMessage({ address: { city: { _errors: ['Unknown city.'] } } }, registered('email')),
    ).toBe('Unknown city.')
    expect(unplacedMessage({ _errors: ['Form level.'] }, registered('email'))).toBe('Form level.')
  })

  it('is undefined when no message can be read', () => {
    expect(unplacedMessage({ nickname: {} }, registered('email'))).toBeUndefined()
  })
})
