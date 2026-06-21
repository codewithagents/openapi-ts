import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import { createRouter, HttpError } from '../../generated-auth/router.js'
import type { AuthLabService } from '../../generated-auth/service.js'

// The principal our app threads through services. The generated Fastify router is
// generic over this type and infers it at the call site, so the concrete name is
// never baked into the generated output.
interface AuthContext {
  userId: string
  scopes: string[]
}

// The service receives the typed ctx (the createContext result), not the raw request.
const authService: AuthLabService<AuthContext> = {
  async getMe(ctx) {
    return { id: ctx.userId, name: `user-${ctx.userId}` }
  },
}

function buildApp(securitySink?: { value?: unknown }) {
  const app = Fastify()
  app.register(
    createRouter(authService, {
      createContext: (req) => {
        // Operation security metadata is available at runtime for scope enforcement.
        if (securitySink !== undefined) securitySink.value = req.routeOptions.config.security
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
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer ada' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: 'ada', name: 'user-ada' })
    await app.close()
  })

  it('rejects with 401 when createContext throws before the handler runs', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })

  it('surfaces operation security metadata on the route config for scope checks', async () => {
    const sink: { value?: unknown } = {}
    const app = buildApp(sink)
    await app.inject({ method: 'GET', url: '/me', headers: { authorization: 'Bearer ada' } })
    expect(sink.value).toEqual([{ scheme: 'bearerAuth', scopes: ['profile:read'] }])
    await app.close()
  })
})
