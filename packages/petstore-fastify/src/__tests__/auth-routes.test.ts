import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import { createRouter, HttpError } from '../../generated-auth/router.js'
import { buildAuthApp, authLabService } from '../server/authApp.js'

// A thin app whose createContext records the surfaced operation security, used only by
// the metadata test below. Public/secured routing itself is exercised via buildAuthApp().
function buildSinkApp(sink: { value?: unknown }) {
  const app = Fastify()
  app.register(
    createRouter(authLabService, {
      createContext: (req) => {
        sink.value = req.routeOptions.config.security
        const auth = req.headers['authorization']
        if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
          throw new HttpError(401, 'Unauthorized')
        }
        return { userId: auth.slice('Bearer '.length), scopes: ['profile:read'] }
      },
    })
  )
  return app
}

describe('issue #335: Fastify createContext auth seam (runtime)', () => {
  it('threads the typed context from createContext into the service method', async () => {
    const app = buildAuthApp()
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer ada' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'ada', name: 'user-ada' })
    await app.close()
  })

  it('rejects a secured route with 401 when no Bearer token is present', async () => {
    const app = buildAuthApp()
    const res = await app.inject({ method: 'GET', url: '/api/me' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('surfaces operation security metadata on the route config for scope checks', async () => {
    const sink: { value?: unknown } = {}
    const app = buildSinkApp(sink)
    await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer ada' } })
    expect(sink.value).toEqual([{ scheme: 'bearerAuth', scopes: ['profile:read'] }])
    await app.close()
  })
})

describe('buildAuthApp: public login route', () => {
  it('POST /api/login with no Authorization header returns 200 and a token', async () => {
    const app = buildAuthApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ username: 'alice', password: 'pw' }),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toBe('alice')
    expect(body.user).toEqual({ id: 'alice', name: 'user-alice' })
    await app.close()
  })
})

describe('buildAuthApp: secured /contact cross-field validation', () => {
  it('accepts a valid email payload (200)', async () => {
    const app = buildAuthApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      payload: JSON.stringify({ method: 'email', email: 'a@b.com', message: 'hi' }),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ accepted: true, method: 'email' })
    await app.close()
  })

  it('rejects a missing email with a 400 from cross-field validation', async () => {
    const app = buildAuthApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
      payload: JSON.stringify({ method: 'email', message: 'hi' }),
    })
    // fastify-type-provider-zod runs the schema (incl. superRefine) at validation time,
    // so a cross-field failure is a native FST_ERR_VALIDATION (400) whose message
    // carries the offending field path and the schema's custom text.
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.code).toBe('FST_ERR_VALIDATION')
    expect(body.message).toContain('email')
    await app.close()
  })

  it('rejects /contact with no Bearer token (401)', async () => {
    const app = buildAuthApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/contact',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ method: 'email', email: 'a@b.com', message: 'hi' }),
    })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
