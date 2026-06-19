import Fastify from 'fastify'
import fastifyFormbody from '@fastify/formbody'
import fastifyMultipart from '@fastify/multipart'
import { createRouter } from '../../generated/router.js'
import { petService } from './petService.js'

const app = Fastify()

// Register body parsers for non-JSON content types.
// @fastify/formbody populates req.body for application/x-www-form-urlencoded requests.
// @fastify/multipart with attachFieldsToBody: true populates req.body for multipart/form-data.
// application/octet-stream is handled by addContentTypeParser inside the generated router.
app.register(fastifyFormbody)
app.register(fastifyMultipart, { attachFieldsToBody: true })

app.register(
  async (instance) => {
    createRouter(instance, petService)
  },
  { prefix: '/api' }
)

const PORT = Number(process.env.PORT ?? 3003)
app.listen({ port: PORT }, () =>
  console.log(`petstore-fastify running on http://localhost:${PORT}`)
)
