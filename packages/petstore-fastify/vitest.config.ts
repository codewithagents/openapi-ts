import { defineConfig } from 'vitest/config'

// Vitest runs only the src/ inject() suites. The e2e/ directory holds Playwright
// request-API specs (run via `pnpm test:e2e`); excluding it keeps vitest from
// trying to execute Playwright's test() and failing.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
