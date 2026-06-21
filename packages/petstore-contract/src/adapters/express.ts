import express from 'express'
import { createRouter } from 'petstore-express/generated/router.js'
import { petService } from 'petstore-express/src/server/petService.js'
import { makeHandle } from '../serverHandle.js'
import type { ServerHandle } from '../startServer.js'

export function startExpress(): Promise<ServerHandle> {
  return new Promise((resolve) => {
    const app = express()
    app.use(express.json())
    app.use('/api', createRouter(petService))
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve(makeHandle(`http://127.0.0.1:${port}`, server))
    })
  })
}
