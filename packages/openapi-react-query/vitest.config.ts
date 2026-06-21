import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/cli.ts', 'src/generator.ts'],
      // Seeded below current (98.39/94.82/100/98.85) with margin so a regression
      // fails CI without brittleness. Ratchet up over time.
      thresholds: {
        branches: 92,
        functions: 97,
        lines: 96,
        statements: 96,
      },
      reporter: ['text', ['lcov', { projectRoot: '../../' }]],
    },
  },
})
