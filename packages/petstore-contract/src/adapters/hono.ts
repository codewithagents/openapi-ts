import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createRouter } from '@codewithagents/petstore-hono/generated/router.js'
import { petService } from '@codewithagents/petstore-hono/src/server/petService.js'
import { makeHandle } from '../serverHandle.js'
import type { ServerHandle } from '../startServer.js'

export function startHono(): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const app = new Hono()
    app.route('/api', createRouter(petService))
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve(makeHandle(`http://127.0.0.1:${info.port}`, server))
    })
  })
}
