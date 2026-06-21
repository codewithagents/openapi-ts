import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Thresholds seeded below current actuals with margin. Ratchet up over time.
      // Branches floor is intentionally lower: the `typeof addr === 'object' && addr ? ... : 0`
      // guards in the adapters create unreachable false branches (port 0 is always an object
      // after a successful listen), so branch coverage is structurally capped around 68-69%.
      thresholds: {
        branches: 65,
        functions: 97,
        lines: 90,
        statements: 90,
      },
      reporter: ['text', ['lcov', { projectRoot: '../../' }]],
    },
  },
})
