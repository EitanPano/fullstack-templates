import { afterEach, describe, expect, it, setSystemTime } from 'bun:test'

import { memory } from '../../src/infra/memory'
import { del, get, incr, set } from '../../src/services/cache'

afterEach(async () => {
  setSystemTime()
  await memory.close()
})

describe('cache', () => {
  it('round-trips an object', async () => {
    await set('k', { a: 1, b: ['x'] })

    expect(await get<{ a: number; b: string[] }>('k')).toEqual({ a: 1, b: ['x'] })
  })

  it('refuses to cache undefined', async () => {
    const failure = await set('k', undefined).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(failure).toEqual(new Error('cannot cache undefined'))
    expect(await get('k')).toBeUndefined()
  })

  it('reads a missing key as undefined', async () => {
    expect(await get('missing')).toBeUndefined()
  })

  it('expires after the ttl', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await set('k', 1, 1000)
    setSystemTime(new Date('2026-01-01T00:00:02Z'))

    expect(await get('k')).toBeUndefined()
  })

  it('counts with incr', async () => {
    expect([await incr('c', 1000), await incr('c', 1000), await incr('c', 1000)]).toEqual([1, 2, 3])
  })

  it('deletes a key', async () => {
    await set('k', 'v')
    await del('k')

    expect(await get('k')).toBeUndefined()
  })

  it('treats a corrupt stored value as absent and removes it', async () => {
    await memory.set('bad', '{not json')

    expect(await get('bad')).toBeUndefined()
    expect(await memory.get('bad')).toBeUndefined()
  })
})
