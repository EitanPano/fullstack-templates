import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { handle, json as jsonResponse } from '../../server/middleware/handler'
import { readInput, validate } from '../../server/middleware/validate'
import { json, through } from './helpers'

const request = {
  body: z.object({ name: z.string().min(1), count: z.number().int().default(1) }),
  query: z.object({ page: z.coerce.number().int().min(1) }),
  params: z.object({ id: z.string().regex(/^[a-z]+$/) }),
}

type Envelope = { error: { code: string; message: string; details?: { path: string }[] } }

const handler = handle(validate(request), (ctx) => jsonResponse(readInput(ctx, request)))

describe('validate', () => {
  it('parses body, query and params and exposes them through readInput', async () => {
    const res = await through(handler, '/probe/abc?page=2', {
      method: 'POST',
      body: { name: 'ada' },
      route: '/probe/:id',
    })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({
      body: { name: 'ada', count: 1 },
      query: { page: 2 },
      params: { id: 'abc' },
    })
  })

  it('answers 400 naming the body and the failing field', async () => {
    const res = await through(handler, '/probe/abc?page=2', {
      method: 'POST',
      body: { name: '' },
      route: '/probe/:id',
    })
    expect(res.status).toBe(400)
    expect(await json<Envelope>(res)).toMatchObject({
      error: { code: 'validation_failed', message: 'invalid body', details: [{ path: 'name' }] },
    })
  })

  it('names the query when the query fails', async () => {
    const res = await through(handler, '/probe/abc?page=0', {
      method: 'POST',
      body: { name: 'ada' },
      route: '/probe/:id',
    })
    expect(await json<Envelope>(res)).toMatchObject({
      error: { message: 'invalid query', details: [{ path: 'page' }] },
    })
  })

  it('names the params when the params fail', async () => {
    const res = await through(handler, '/probe/ABC?page=1', {
      method: 'POST',
      body: { name: 'ada' },
      route: '/probe/:id',
    })
    expect(await json<Envelope>(res)).toMatchObject({
      error: { message: 'invalid params', details: [{ path: 'id' }] },
    })
  })

  it('parses only the parts it was given and never reads a body nobody asked for', async () => {
    const queryOnly = { query: request.query }
    const only = handle(validate(queryOnly), (ctx) => jsonResponse(readInput(ctx, queryOnly)))
    const res = await through(only, '/probe?page=3', { method: 'POST', body: '{not json' })
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ query: { page: 3 } })
  })

  it('reports the first part that fails and stops there', async () => {
    const res = await through(handler, '/probe/ABC?page=0', {
      method: 'POST',
      body: { name: '' },
      route: '/probe/:id',
    })
    expect(await json<Envelope>(res)).toMatchObject({ error: { message: 'invalid body' } })
  })
})
