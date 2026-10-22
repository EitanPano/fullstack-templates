import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { SQL } from 'bun'
import express from 'express'
import request from 'supertest'

import { errorHandler } from '../../src/middleware/error-handler'
import { requestId } from '../../src/middleware/request-id'
import { AppError } from '../../src/services/utils/error'
import { classifyPostgresError } from '../../src/services/utils/postgres-error'

// A port nothing listens on: the driver reports a refused connection, which is the same
// failure a stopped database gives.
const CLOSED_PORT_URL = 'postgres://app:app@127.0.0.1:1/app'

async function refusedConnection(): Promise<Error> {
  const client = new SQL(CLOSED_PORT_URL, { connectionTimeout: 2, max: 1 })
  try {
    await client`select 1`
  } catch (error) {
    if (error instanceof Error) return error
    throw new Error('the driver rejected with a non-error value')
  } finally {
    await client.close({ timeout: 0 })
  }
  throw new Error('the closed port accepted a connection')
}

function serverError(errno: string, extra: { detail?: string; constraint?: string } = {}) {
  return new SQL.PostgresError(`driver text for ${errno}`, {
    code: 'ERR_POSTGRES_SERVER_ERROR',
    errno,
    ...extra,
  })
}

afterEach(() => {
  spyOn(console, 'error').mockRestore()
})

describe('classifyPostgresError', () => {
  it('maps a refused connection from the real driver to upstream_unavailable', async () => {
    const mapped = classifyPostgresError(await refusedConnection())

    expect(mapped).toBeInstanceOf(AppError)
    expect(mapped?.code).toBe('upstream_unavailable')
    expect(mapped?.status).toBe(503)
    expect(mapped?.message).toBe('the database is unavailable')
  })

  it('maps the driver connection codes and the shutdown SQLSTATEs to upstream_unavailable', () => {
    const closed = new SQL.PostgresError('Connection closed', {
      code: 'ERR_POSTGRES_CONNECTION_CLOSED',
    })
    const timeout = new SQL.PostgresError('t', { code: 'ERR_POSTGRES_CONNECTION_TIMEOUT' })
    const idle = new SQL.PostgresError('t', { code: 'ERR_POSTGRES_IDLE_TIMEOUT' })

    for (const error of [closed, timeout, idle, serverError('57P01'), serverError('57P03')]) {
      expect(classifyPostgresError(error)?.code).toBe('upstream_unavailable')
    }
    expect(classifyPostgresError(serverError('08006'))?.code).toBe('upstream_unavailable')
    expect(classifyPostgresError(serverError('53300'))?.code).toBe('upstream_unavailable')
  })

  it('maps a unique violation to conflict without the detail or constraint', () => {
    const mapped = classifyPostgresError(
      serverError('23505', {
        detail: 'Key (email)=(a@b.co) already exists',
        constraint: 'user_email_key',
      }),
    )

    expect(mapped?.code).toBe('conflict')
    expect(mapped?.status).toBe(409)
    expect(JSON.stringify(mapped)).not.toContain('email')
    expect(mapped?.message).not.toContain('user_email_key')
  })

  it('leaves every other error to the handler', () => {
    expect(classifyPostgresError(serverError('42P01'))).toBeUndefined()
    expect(classifyPostgresError(serverError('23503'))).toBeUndefined()
    expect(classifyPostgresError(new Error('Failed to connect'))).toBeUndefined()
    expect(classifyPostgresError('23505')).toBeUndefined()
    expect(classifyPostgresError(undefined)).toBeUndefined()
  })
})

describe('the error handler with a database failure', () => {
  function probeApp(fail: () => Promise<unknown>) {
    const app = express()
    app.use(requestId)
    app.get('/db', async () => {
      await fail()
    })
    app.use(errorHandler)
    return app
  }

  it('answers 503 upstream_unavailable with a request id and none of the driver text', async () => {
    spyOn(console, 'error').mockImplementation(() => undefined)
    const real = await refusedConnection()

    const res = await request(probeApp(() => Promise.reject(real))).get('/db')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({
      error: { code: 'upstream_unavailable', message: 'the database is unavailable' },
      requestId: res.headers['x-request-id'],
    })
    expect(real.message).not.toBe('')
    expect(res.text).not.toContain(real.message)
    expect(res.text).not.toContain('127.0.0.1')
  })

  it('answers 409 conflict for a unique violation and keeps the detail out', async () => {
    spyOn(console, 'error').mockImplementation(() => undefined)
    const error = serverError('23505', { detail: 'Key (email)=(a@b.co) already exists' })

    const res = await request(probeApp(() => Promise.reject(error))).get('/db')

    expect(res.status).toBe(409)
    expect(res.body).toMatchObject({ error: { code: 'conflict' } })
    expect(res.text).not.toContain('a@b.co')
  })

  it('still answers a bare internal for a database error it does not classify', async () => {
    spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await request(probeApp(() => Promise.reject(serverError('42P01')))).get('/db')

    expect(res.status).toBe(500)
    expect(res.body).toMatchObject({ error: { code: 'internal', message: 'unexpected error' } })
    expect(res.text).not.toContain('42P01')
  })
})
