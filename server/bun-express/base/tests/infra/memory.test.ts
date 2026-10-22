import { afterEach, describe, expect, it, setSystemTime, spyOn } from 'bun:test'

import { SWEEP_INTERVAL_MS, createMemoryStore } from '../../src/infra/memory'
import { createLogger } from '../../src/services/logger'

afterEach(() => {
  setSystemTime()
})

function fresh(production = false) {
  const lines: string[] = []
  const logger = createLogger({
    quiet: false,
    sink: {
      info: (line: string) => lines.push(`info ${line}`),
      warn: (line: string) => lines.push(`warn ${line}`),
      error: (line: string) => lines.push(`error ${line}`),
    },
  })
  return { store: createMemoryStore({ production, logger }), lines }
}

type Note = { id: string; text: string; at?: Date }

describe('record store', () => {
  it('puts, gets, finds and deletes records', async () => {
    const notes = fresh().store.collection<Note>('note')
    await notes.put({ id: 'a', text: 'one' })
    await notes.put({ id: 'b', text: 'two' })

    expect(await notes.get('a')).toEqual({ id: 'a', text: 'one' })
    expect(await notes.find((note) => note.text === 'two')).toEqual([{ id: 'b', text: 'two' }])
    expect((await notes.find(() => true)).map((note) => note.id)).toEqual(['a', 'b'])
    expect(await notes.delete('a')).toBe(true)
    expect(await notes.get('a')).toBeUndefined()
  })

  it('reports a missing record and a missing delete', async () => {
    const notes = fresh().store.collection<Note>('note')

    expect(await notes.get('nope')).toBeUndefined()
    expect(await notes.delete('nope')).toBe(false)
    expect(await notes.find(() => true)).toEqual([])
  })

  it('upserts by id', async () => {
    const notes = fresh().store.collection<Note>('note')
    await notes.put({ id: 'a', text: 'one' })
    await notes.put({ id: 'a', text: 'changed' })

    expect(await notes.find(() => true)).toEqual([{ id: 'a', text: 'changed' }])
  })

  it('does not let a caller mutate the store through a stored or returned object', async () => {
    const notes = fresh().store.collection<Note>('note')
    const original: Note = { id: 'a', text: 'one', at: new Date(0) }
    await notes.put(original)
    original.text = 'mutated'
    const read = await notes.get('a')
    if (read === undefined) throw new Error('missing')
    read.text = 'mutated again'

    const again = await notes.get('a')
    expect(again?.text).toBe('one')
    expect(again?.at).toBeInstanceOf(Date)
    expect((await notes.find(() => true))[0]).not.toBe(again)
  })

  it('keeps collections apart', async () => {
    const { store } = fresh()
    await store.collection<Note>('x').put({ id: 'a', text: 'x' })

    expect(await store.collection<Note>('y').get('a')).toBeUndefined()
  })
})

describe('key-value store', () => {
  it('sets, gets and deletes a key', async () => {
    const { store } = fresh()
    await store.set('k', 'v')

    expect(await store.get('k')).toBe('v')
    await store.delete('k')
    expect(await store.get('k')).toBeUndefined()
  })

  it('expires a key after its ttl and never expires one without', async () => {
    const { store } = fresh()
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await store.set('short', 'v', 1000)
    await store.set('forever', 'v')
    setSystemTime(new Date('2026-01-01T00:00:01.500Z'))

    expect(await store.get('short')).toBeUndefined()
    expect(await store.get('forever')).toBe('v')
  })

  it('removes an expired key on read so nothing stale lingers', async () => {
    const { store } = fresh()
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await store.set('k', 'old', 1000)
    setSystemTime(new Date('2026-01-01T00:00:02Z'))

    expect(await store.get('k')).toBeUndefined()
    await store.set('k', 'new')
    setSystemTime(new Date('2026-01-02T00:00:00Z'))
    expect(await store.get('k')).toBe('new')
  })

  it('rejects a non-positive ttl on increment', () => {
    const { store } = fresh()

    expect(() => store.increment('c', 0)).toThrow('ttlMs must be positive')
    expect(() => store.increment('c', -5)).toThrow('ttlMs must be positive')
  })

  it('increments from 1, resets after the ttl and keeps the first expiry', async () => {
    const { store } = fresh()
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(await store.increment('c', 1000)).toBe(1)
    setSystemTime(new Date('2026-01-01T00:00:00.600Z'))
    expect(await store.increment('c', 1000)).toBe(2)
    setSystemTime(new Date('2026-01-01T00:00:00.900Z'))
    expect(await store.increment('c', 1000)).toBe(3)
    setSystemTime(new Date('2026-01-01T00:00:01.100Z'))
    expect(await store.increment('c', 1000)).toBe(1)
  })
})

describe('lifecycle', () => {
  it('connect logs the store, ping resolves and close clears everything', async () => {
    const { store, lines } = fresh()
    await store.connect()
    await store.collection<Note>('note').put({ id: 'a', text: 'one' })
    await store.set('k', 'v')

    await store.ping()
    await store.close()

    expect(lines).toEqual(['info connected store store=memory'])
    expect(await store.collection<Note>('note').get('a')).toBeUndefined()
    expect(await store.get('k')).toBeUndefined()
  })

  it('close empties a handle obtained earlier and keeps handles for one name shared', async () => {
    const { store } = fresh()
    const early = store.collection<Note>('note')
    await early.put({ id: 'a', text: 'one' })

    await store.close()

    expect(await early.get('a')).toBeUndefined()
    const late = store.collection<Note>('note')
    await late.put({ id: 'b', text: 'two' })
    expect(await early.get('b')).toEqual({ id: 'b', text: 'two' })
  })

  it('increment restarts a non-numeric stored value at 1 with the new ttl', async () => {
    const { store } = fresh()
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await store.set('c', 'abc')

    expect(await store.increment('c', 1000)).toBe(1)
    setSystemTime(new Date('2026-01-01T00:00:00.600Z'))
    expect(await store.increment('c', 1000)).toBe(2)
    setSystemTime(new Date('2026-01-01T00:00:01.100Z'))
    expect(await store.increment('c', 1000)).toBe(1)
  })

  it('warns in production only', async () => {
    const prod = fresh(true)
    await prod.store.connect()
    const dev = fresh(false)
    await dev.store.connect()

    expect(prod.lines.some((line) => line.startsWith('warn in-memory store'))).toBe(true)
    expect(dev.lines.some((line) => line.startsWith('warn'))).toBe(false)
  })
})

describe('sweep', () => {
  it('removes expired keys without reading them', async () => {
    const { store } = fresh()
    setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await store.set('a', '1', 1000)
    await store.set('b', '1', 2000)
    await store.set('c', '1', 60_000)
    await store.set('d', '1')
    setSystemTime(new Date('2026-01-01T00:00:05Z'))

    expect(store.sweep()).toBe(2)
    expect(store.sweep()).toBe(0)
    expect(await store.get('c')).toBe('1')
    expect(await store.get('d')).toBe('1')
  })

  it('runs on a timer after connect and stops after close', async () => {
    const { store } = fresh()
    const set = spyOn(globalThis, 'setInterval')
    const clear = spyOn(globalThis, 'clearInterval')
    await store.connect()
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0]?.[1]).toBe(SWEEP_INTERVAL_MS)

    await store.close()
    expect(clear).toHaveBeenCalledTimes(1)
    await store.connect()
    await store.close()
    expect(clear).toHaveBeenCalledTimes(2)
    set.mockRestore()
    clear.mockRestore()
  })
})
