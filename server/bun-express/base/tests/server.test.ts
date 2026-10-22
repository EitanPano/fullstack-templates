import { describe, expect, it } from 'bun:test'
import request from 'supertest'

import { env } from '../src/config/env'
import { app } from '../src/server'

// @auth-start
// Oversize bodies (413) are covered in error-handler.test.ts; cookie parsing has no probe
// route on `app` and is covered by the auth tests.
// @auth-end
// @noauth-start
// Oversize bodies (413) are covered in error-handler.test.ts.
// @noauth-end
describe('server assembly', () => {
  it('does not advertise the framework', async () => {
    const res = await request(app).get('/api/health')

    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('sets helmet headers, also on a 404', async () => {
    const ok = await request(app).get('/api/health')
    const missing = await request(app).get('/nope')

    expect(ok.headers['x-content-type-options']).toBe('nosniff')
    expect(missing.headers['x-content-type-options']).toBe('nosniff')
  })

  it('sends no CORS headers when CORS_ORIGINS is unset', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://evil.test')

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('applies the configured trust proxy setting', () => {
    expect(app.get('trust proxy')).toEqual(env.TRUST_PROXY)
  })
})
