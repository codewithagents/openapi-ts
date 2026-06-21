import Fastify from 'fastify'
import { createRouter } from '../../generated/router.js'
import { petService } from './petService.js'

const app = Fastify()

// Body parsers (@fastify/formbody, @fastify/multipart) are auto-registered inside
// the generated router plugin for the content types declared in the spec.
// Pass registerParsers: false to createRouter if you need custom options (e.g. size limits).
app.register(createRouter(petService), { prefix: '/api' })

const PORT = Number(process.env.PORT ?? 3003)
app.listen({ port: PORT }, () =>
  console.log(`petstore-fastify running on http://localhost:${PORT}`)
)
