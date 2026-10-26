import { z } from 'zod'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ActionError } from '@/shared/lib/action-error'
import { action, GENERIC_ERROR, handleServerError } from '@/shared/lib/safe-action'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleServerError', () => {
  it('passes the copy of an ActionError through', () => {
    expect(handleServerError(new ActionError('Name not allowed'))).toBe('Name not allowed')
  })

  it('logs any other error with its cause and returns the generic message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('secret: db password hunter2')

    const message = handleServerError(error)

    expect(message).toBe(GENERIC_ERROR)
    expect(message).not.toContain('hunter2')
    expect(log).toHaveBeenCalledWith('[action] unexpected error:', error)
  })
})

describe('action', () => {
  it('validates the input with the schema and runs the handler', async () => {
    const run = action
      .inputSchema(z.object({ name: z.string().min(2) }))
      .action(({ parsedInput }) => Promise.resolve({ echoed: parsedInput.name }))

    await expect(run({ name: 'ok' })).resolves.toEqual({ data: { echoed: 'ok' } })
    const bad = await run({ name: 'x' })
    expect(bad.validationErrors?.name?._errors).toHaveLength(1)
  })

  it('reaches the client as serverError: our copy for an ActionError, the generic text otherwise', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const expected = action.action(() => {
      throw new ActionError('Name not allowed')
    })
    const unexpected = action.action(() => {
      throw new Error('secret: db password hunter2')
    })

    expect((await expected()).serverError).toBe('Name not allowed')
    expect((await unexpected()).serverError).toBe(GENERIC_ERROR)
  })
})
