import { afterEach, beforeEach, describe, expect, it, setSystemTime } from 'bun:test'
import { Cron } from 'croner'

import { memory } from '../../src/infra/memory'
import { sessionCleanup } from '../../src/infra/jobs/session-cleanup'
import { createScheduler } from '../../src/infra/scheduler'
import { getDb } from '../../src/services/db'
import type { SessionRecord } from '../../src/models/session/interface'
import { createSession, revokeSession } from '../../src/services/session'

const DAY = 24 * 60 * 60 * 1000

beforeEach(async () => {
  await memory.close()
})

afterEach(() => {
  setSystemTime()
})

const stored = (id: string) => getDb().collection<SessionRecord>('session').get(id)

describe('sessionCleanup', () => {
  it('purges expired sessions and keeps a fresh one', async () => {
    const old = await createSession('user-1')
    setSystemTime(new Date(Date.now() + 31 * DAY))
    const fresh = await createSession('user-1')

    await sessionCleanup.run()

    expect(await stored(old.session.id)).toBeUndefined()
    expect(await stored(fresh.session.id)).toBeDefined()
  })

  it('purges a revoked session', async () => {
    const revoked = await createSession('user-2')
    const live = await createSession('user-2')
    await revokeSession(revoked.session.id)

    await sessionCleanup.run()

    expect(await stored(revoked.session.id)).toBeUndefined()
    expect(await stored(live.session.id)).toBeDefined()
  })

  it('does nothing when no session is dead', async () => {
    const live = await createSession('user-3')

    await sessionCleanup.run()

    expect(await stored(live.session.id)).toBeDefined()
  })

  it('has a valid cron pattern and its name', () => {
    expect(sessionCleanup.name).toBe('session-cleanup')
    const cron = new Cron(sessionCleanup.schedule, { paused: true })
    expect(cron.nextRun()).not.toBeNull()
    cron.stop()
  })

  it('is scheduled by the scheduler when enabled, and not when disabled', async () => {
    const enabled = createScheduler({ jobs: [sessionCleanup], enabled: true })
    await enabled.connect()
    expect(enabled.running()).toContain('session-cleanup')
    await enabled.close()

    const disabled = createScheduler({ jobs: [sessionCleanup], enabled: false })
    await disabled.connect()
    expect(disabled.running()).toEqual([])
    await disabled.close()
  })
})
