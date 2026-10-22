import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import express from 'express'
import request from 'supertest'

import { AppError } from '../src/services/utils/error'
import { readInput, validate } from '../src/middleware/validate'
import { z } from '../src/services/utils/zod'
import { errorHandler } from '../src/middleware/error-handler'
import { notFound } from '../src/middleware/not-found'
import { requestId } from '../src/middleware/request-id'

const Greeting = z.object({ name: z.string().min(1) })

// Route adapters shaped like the real ones on a throwaway app: pins the contract every module
// relies on (validation envelope, AppError mapping, body limits) without depending on one.
function probeApp() {
  const app = express()
  app.use(requestId)
  app.use(express.json({ limit: '1kb' }))
  const greetInput = { body: Greeting }
  app.post('/greet', validate(greetInput), (_req, res) => {
    const { body } = readInput(res, greetInput)
    res.status(201).json({ greeting: `hello ${body.name}` })
  })
  app.get('/missing', () => {
    throw new AppError('not_found', 'thing 7 not found')
  })
  app.get('/boom', () => {
    throw new Error('connection string leaked here')
  })
  app.use(notFound)
  app.use(errorHandler)
  return app
}

afterEach(() => {
  spyOn(console, 'error').mockRestore()
})

describe('a route adapter', () => {
  it('sends its response with the status it chose', async () => {
    const res = await request(probeApp()).post('/greet').send({ name: 'ada' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({ greeting: 'hello ada' })
  })

  it('rejects an invalid body with the validation envelope naming the field', async () => {
    const res = await request(probeApp()).post('/greet').send({ name: '' })

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({
      error: { code: 'validation_failed', message: 'invalid body', details: [{ path: 'name' }] },
      requestId: res.headers['x-request-id'],
    })
  })
})

describe('the error handler', () => {
  it('turns malformed JSON into a 400 envelope', async () => {
    const res = await request(probeApp())
      .post('/greet')
      .set('content-type', 'application/json')
      .send('{not json')

    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ error: { code: 'validation_failed' } })
  })

  it('turns an oversized body into a 413 envelope', async () => {
    const res = await request(probeApp())
      .post('/greet')
      .send({ name: 'x'.repeat(2048) })

    expect(res.status).toBe(413)
    expect(res.body).toMatchObject({ error: { code: 'payload_too_large' } })
  })

  it('maps an AppError thrown by a service to its status and code', async () => {
    const res = await request(probeApp()).get('/missing')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'not_found', message: 'thing 7 not found' },
      requestId: res.headers['x-request-id'],
    })
  })

  it('hides an unexpected error behind a bare internal envelope and logs it', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await request(probeApp()).get('/boom')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      error: { code: 'internal', message: 'unexpected error' },
      requestId: res.headers['x-request-id'],
    })
    expect(res.text).not.toContain('connection string')
    expect(error).toHaveBeenCalledTimes(1)
  })
})
