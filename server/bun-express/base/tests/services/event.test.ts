import { afterEach, describe, expect, it } from 'bun:test'

import { drain, publish, subscribe } from '../../src/services/event'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('event', () => {
  it('delivers the typed payload to a subscriber', async () => {
    const seen: string[] = []
    cleanups.push(
      subscribe('user.registered', ({ userId }) => { // @auth
      subscribe('module.created', ({ moduleId }) => { // @noauth
        seen.push(userId) // @auth
        seen.push(moduleId) // @noauth
      }),
    )

    await publish('user.registered', { userId: 'u1' }) // @auth
    await publish('module.created', { moduleId: 'm1' }) // @noauth
    await drain()

    expect(seen).toEqual(['u1']) // @auth
    expect(seen).toEqual(['m1']) // @noauth
  })

  it('does not let a throwing subscriber block another', async () => {
    let ran = false
    cleanups.push(
      subscribe('user.registered', () => { // @auth
      subscribe('module.created', () => { // @noauth
        throw new Error('boom')
      }),
      subscribe('user.registered', () => { // @auth
      subscribe('module.created', () => { // @noauth
        ran = true
      }),
    )

    await publish('user.registered', { userId: 'u2' }) // @auth
    await publish('module.created', { moduleId: 'm2' }) // @noauth
    await drain()

    expect(ran).toBe(true)
  })

  it('stops delivering after unsubscribe', async () => {
    let calls = 0
    const unsubscribe = subscribe('user.registered', () => { // @auth
    const unsubscribe = subscribe('module.created', () => { // @noauth
      calls += 1
    })

    unsubscribe()
    await publish('user.registered', { userId: 'u3' }) // @auth
    await publish('module.created', { moduleId: 'm3' }) // @noauth
    await drain()

    expect(calls).toBe(0)
  })
})
