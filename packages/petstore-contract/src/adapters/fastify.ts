import Fastify from 'fastify'
import { createRouter } from 'petstore-fastify/generated/router.js'
import { petService } from 'petstore-fastify/src/server/petService.js'
import type { ServerHandle } from '../startServer.js'

export async function startFastify(): Promise<ServerHandle> {
  const app = Fastify()
  await app.register(createRouter(petService), { prefix: '/api' })
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const addr = app.server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => app.close() }
}
