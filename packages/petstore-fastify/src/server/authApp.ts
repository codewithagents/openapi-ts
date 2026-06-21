import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { createRouter, HttpError } from '../../generated-auth/router.js'
import type { AuthLabService } from '../../generated-auth/service.js'

export interface BuildAuthAppOptions {
  /** Absolute path to a built frontend directory to serve for non-API routes. */
  serveStatic?: string
}

// The principal threaded through all secured service methods.
export interface AuthContext {
  userId: string
  scopes: string[]
}

export const authLabService: AuthLabService<AuthContext> = {
  async getMe(ctx) {
    return { id: ctx.userId, name: `user-${ctx.userId}` }
  },
  async login(body) {
    // Issue a token equal to the username so it can be echoed back in tests.
    return {
      token: body.username,
      user: { id: body.username, name: `user-${body.username}` },
    }
  },
  async contact(body, ctx) {
    // Acknowledge contact: echo the method back.
    void ctx
    return { accepted: true, method: body.method }
  },
}

export function buildAuthApp(options: BuildAuthAppOptions = {}) {
  const app = Fastify()

  app.register(
    createRouter<AuthContext>(authLabService, {
      createContext: (req) => {
        const security = req.routeOptions.config.security
        // The generated router surfaces operation security only when it is non-empty.
        // An explicit `security: []` override (POST /login) is emitted as no security
        // metadata at all, so undefined-or-empty means the route is public.
        if (security === undefined || security.length === 0) {
          return { userId: 'anonymous', scopes: [] }
        }
        // All other routes require a Bearer token.
        const auth = req.headers['authorization']
        if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
          throw new HttpError(401, 'Unauthorized')
        }
        return { userId: auth.slice('Bearer '.length), scopes: ['profile:read'] }
      },
    }),
    { prefix: '/api' }
  )

  // Serve the built React app for every non-API route (the full-stack reference).
  // The /api router is registered first so API routes take priority over static files.
  if (options.serveStatic !== undefined) {
    app.register(fastifyStatic, { root: options.serveStatic })
  }

  return app
}
