import { defineConfig } from '@playwright/test'

// Real-socket HTTP e2e against the generated Fastify router.
// API-only: tests use Playwright's `request` (APIRequestContext) fixture, no browser.
// The webServer below boots the generated server; `pnpm generate` runs first via the
// test:e2e script so the gitignored generated/ output exists before the server starts.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared in-memory pet store; keep tests ordered
  workers: 1, // single worker: the server holds one shared in-memory store
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3003' },
  webServer: {
    command: 'tsx src/server/index.ts',
    port: 3003,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
