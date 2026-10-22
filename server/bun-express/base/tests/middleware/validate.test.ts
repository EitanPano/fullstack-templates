import { describe, expect, it } from 'bun:test'
import express from 'express'
import request from 'supertest'

import { errorHandler } from '../../src/middleware/error-handler'
import { readInput, validate } from '../../src/middleware/validate'
import { z } from '../../src/services/utils/zod'

type Body = {
  parsed: { body?: unknown; query: { page: unknown }; params?: unknown }
  keys: string[]
  error: { message: string; code: string; details: { path: string }[] }
}

const input = {
  body: z.object({ name: z.string().min(1) }),
  query: z.object({ page: z.coerce.number().int() }),
  params: z.object({ id: z.string().min(3) }),
}

function probe(schemas: Partial<typeof input>) {
  const app = express()
  app.use(express.json())
  app.post('/thing/:id', validate(schemas), (_req, res) => {
    const parsed = readInput(res, schemas)
    res.json({ parsed, keys: Object.keys(res.locals.input as object) })
  })
  app.use(errorHandler)
  return app
}

describe('validate', () => {
  it('parses body, query and params and exposes them through readInput', async () => {
    const res = await request(probe(input)).post('/thing/abc?page=3').send({ name: 'ada' })

    expect(res.status).toBe(200)
    expect((res.body as Body).parsed).toEqual({
      body: { name: 'ada' },
      query: { page: 3 },
      params: { id: 'abc' },
    })
    expect(typeof (res.body as Body).parsed.query.page).toBe('number')
  })

  it('answers 400 naming the body and the failing field', async () => {
    const res = await request(probe({ body: input.body }))
      .post('/thing/abc')
      .send({ name: '' })

    expect(res.status).toBe(400)
    expect((res.body as Body).error).toMatchObject({
      code: 'validation_failed',
      message: 'invalid body',
      details: [{ path: 'name' }],
    })
  })

  it('names the query when the query fails', async () => {
    const res = await request(probe({ query: input.query }))
      .post('/thing/abc?page=x')
      .send({})

    expect(res.status).toBe(400)
    expect((res.body as Body).error.message).toBe('invalid query')
    expect((res.body as Body).error.details[0]?.path).toBe('page')
  })

  it('names the params when the params fail', async () => {
    const res = await request(probe({ params: input.params }))
      .post('/thing/ab')
      .send({})

    expect(res.status).toBe(400)
    expect((res.body as Body).error.message).toBe('invalid params')
    expect((res.body as Body).error.details[0]?.path).toBe('id')
  })

  it('parses only the parts it was given', async () => {
    const res = await request(probe({ query: input.query }))
      .post('/thing/abc?page=1')
      .send({ anything: true })

    expect(res.status).toBe(200)
    expect((res.body as Body).keys).toEqual(['query'])
  })
})
