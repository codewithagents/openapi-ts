export type Framework = 'fastify' | 'hono' | 'express'

export interface ServerHandle {
  baseUrl: string
  close: () => Promise<void>
}

export async function startServer(framework: Framework): Promise<ServerHandle> {
  switch (framework) {
    case 'fastify': {
      const { startFastify } = await import('./adapters/fastify.js')
      return startFastify()
    }
    case 'hono': {
      const { startHono } = await import('./adapters/hono.js')
      return startHono()
    }
    case 'express': {
      const { startExpress } = await import('./adapters/express.js')
      return startExpress()
    }
    default: {
      const _exhaustive: never = framework
      throw new Error(`Unknown framework: ${String(_exhaustive)}`)
    }
  }
}
