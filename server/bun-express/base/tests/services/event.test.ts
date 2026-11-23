import { afterEach, describe, expect, it } from 'bun:test'

import { drain, publish, subscribe } from '../../src/services/event'
import { captureLogs } from '../logs'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('event', () => {
  it('delivers the typed payload to a subscriber', async () => {
    const seen: string[] = []
    cleanups.push(
      subscribe('user.signedup', ({ userId }) => { // @auth
      subscribe('entity.created', ({ entityId }) => { // @noauth
        seen.push(userId) // @auth
        seen.push(entityId) // @noauth
      }),
    )

    await publish('user.signedup', { userId: 'u1' }) // @auth
    await publish('entity.created', { entityId: 'm1' }) // @noauth
    await drain()

    expect(seen).toEqual(['u1']) // @auth
    expect(seen).toEqual(['m1']) // @noauth
  })

  it('does not let a throwing subscriber block another', async () => {
    let ran = false
    // The failure is logged on purpose; capture it so a green run prints no stack trace.
    const logs = captureLogs([/^subscriber failed topic=\S+ reason=boom/])
    cleanups.push(
      subscribe('user.signedup', () => { // @auth
      subscribe('entity.created', () => { // @noauth
        throw new Error('boom')
      }),
      subscribe('user.signedup', () => { // @auth
      subscribe('entity.created', () => { // @noauth
        ran = true
      }),
    )

    try {
      await publish('user.signedup', { userId: 'u2' }) // @auth
      await publish('entity.created', { entityId: 'm2' }) // @noauth
      await drain()
    } finally {
      logs.restore()
    }

    expect(ran).toBe(true)
    expect(logs.lines).toHaveLength(1)
  })

  it('stops delivering after unsubscribe', async () => {
    let calls = 0
    const unsubscribe = subscribe('user.signedup', () => { // @auth
    const unsubscribe = subscribe('entity.created', () => { // @noauth
      calls += 1
    })

    unsubscribe()
    await publish('user.signedup', { userId: 'u3' }) // @auth
    await publish('entity.created', { entityId: 'm3' }) // @noauth
    await drain()

    expect(calls).toBe(0)
  })
})
