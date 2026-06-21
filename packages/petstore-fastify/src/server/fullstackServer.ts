import { resolve } from 'node:path'
import { buildAuthApp } from './authApp.js'

// The full-stack reference server: serves the built React frontend plus the auth API
// (login + secured /me and /contact) on a single port. `vite build` writes to ./dist.
const dist = resolve(import.meta.dirname, '../../dist')
const app = buildAuthApp({ serveStatic: dist })

const port = Number(process.env.PORT ?? 3004)
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`petstore-fastify fullstack running on http://localhost:${port}`)
})
