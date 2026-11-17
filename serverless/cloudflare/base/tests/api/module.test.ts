import { describe, expect, it } from 'vitest'

import { createModule, json, send } from './helpers'

type PublicModule = {
  id: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
}
type Page = { items: PublicModule[]; nextCursor: string | null }
type Envelope = { error: { code: string; message: string; details?: { path: string }[] } }

describe('GET /api/module', () => {
  it('lists nothing when empty', async () => {
    const res = await send('/api/module')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ items: [], nextCursor: null })
  })

  it('pages through every item exactly once, in (createdAt, id) order, with the cursor', async () => {
    const names = ['one', 'two', 'three', 'four', 'five']
    for (const name of names) await createModule(name)

    const seen: PublicModule[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const next: string = cursor === null ? '' : `&cursor=${cursor}`
      const page: Page = await json<Page>(await send(`/api/module?limit=2${next}`))
      expect(page.items.length).toBeLessThanOrEqual(2)
      seen.push(...page.items)
      cursor = page.nextCursor
      pages++
    } while (cursor !== null)

    expect(pages).toBe(3)
    expect(seen.map((item) => item.name).sort()).toEqual([...names].sort())
    const keys = seen.map((item) => [Date.parse(item.createdAt), item.id] as const)
    const ordered = [...keys].sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1))
    expect(keys).toEqual(ordered)
  })

  it('rejects an invalid cursor and a limit out of bounds with 400', async () => {
    const cursor = await send('/api/module?cursor=not-a-cursor')
    expect(cursor.status).toBe(400)
    expect(await json<Envelope>(cursor)).toMatchObject({ error: { code: 'validation_failed' } })

    expect((await send('/api/module?limit=0')).status).toBe(400)
    expect((await send('/api/module?limit=101')).status).toBe(400)
  })
})

describe('POST /api/module', () => {
  it('creates an active module with ISO timestamps and a uuid', async () => {
    const res = await send('/api/module', { method: 'POST', body: { name: '  Billing  ' } })
    expect(res.status).toBe(201)
    const created = await json<PublicModule>(res)
    expect(created).toMatchObject({ name: 'Billing', status: 'active' })
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt)
    expect(created.updatedAt).toBe(created.createdAt)
  })

  it('answers 400 for an empty name, a missing name and an unknown field type', async () => {
    for (const body of [{ name: '' }, {}, { name: 5 }, { name: 'x'.repeat(101) }]) {
      const res = await send('/api/module', { method: 'POST', body })
      expect(res.status).toBe(400)
      expect(await json<Envelope>(res)).toMatchObject({
        error: { code: 'validation_failed', message: 'invalid body' },
      })
    }
  })
})

describe('GET /api/module/{id}', () => {
  it('returns the module', async () => {
    const { id } = await createModule('Search')
    const res = await send(`/api/module/${id}`)
    expect(res.status).toBe(200)
    expect(await json<PublicModule>(res)).toMatchObject({ id, name: 'Search' })
  })

  it('answers 404 for an unknown id', async () => {
    const res = await send('/api/module/does-not-exist')
    expect(res.status).toBe(404)
    expect(await json<Envelope>(res)).toMatchObject({ error: { code: 'not_found' } })
  })
})

describe('PATCH /api/module/{id}', () => {
  it('renames the module and keeps createdAt', async () => {
    const created = await json<PublicModule>(
      await send('/api/module', { method: 'POST', body: { name: 'Old' } }),
    )
    const res = await send(`/api/module/${created.id}`, { method: 'PATCH', body: { name: 'New' } })
    expect(res.status).toBe(200)
    const updated = await json<PublicModule>(res)
    expect(updated).toMatchObject({ id: created.id, name: 'New', status: 'active' })
    expect(updated.createdAt).toBe(created.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
  })

  it('archives the module', async () => {
    const { id } = await createModule('Archive me')
    const res = await send(`/api/module/${id}`, { method: 'PATCH', body: { status: 'archived' } })
    expect(await json<PublicModule>(res)).toMatchObject({ status: 'archived' })
  })

  it('answers 400 for an empty body and for an unknown status', async () => {
    const { id } = await createModule('Strict')
    for (const body of [{}, { status: 'deleted' }]) {
      const res = await send(`/api/module/${id}`, { method: 'PATCH', body })
      expect(res.status).toBe(400)
    }
  })

  it('answers 404 for an unknown id', async () => {
    const res = await send('/api/module/does-not-exist', { method: 'PATCH', body: { name: 'x' } })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/module/{id}', () => {
  it('answers 204, then 404 on get', async () => {
    const { id } = await createModule('Doomed')
    const res = await send(`/api/module/${id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
    expect((await send(`/api/module/${id}`)).status).toBe(404)
  })

  it('answers 404 for an unknown id and keeps the others', async () => {
    const { id } = await createModule('Survivor')
    expect((await send('/api/module/does-not-exist', { method: 'DELETE' })).status).toBe(404)
    expect((await send(`/api/module/${id}`)).status).toBe(200)
  })
})

describe('the tests', () => {
  it('start from empty tables: the rows of the previous test are gone', async () => {
    expect((await json<Page>(await send('/api/module'))).items).toEqual([])
  })
})
