import { defineConfig, devices } from '@playwright/test'

// Browser e2e for the full-stack auth reference: a real Chromium drives the React app,
// which talks to the generated Fastify auth router over a real socket. The test:e2e:auth
// script runs `pnpm build` first (generate + vite build) so ./dist exists; the webServer
// below just boots the server that serves that build plus the API on port 3004.
export default defineConfig({
  testDir: './e2e-auth',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3004' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'PORT=3004 tsx src/server/fullstackServer.ts',
    port: 3004,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
