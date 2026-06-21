import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/cli.ts',
        'src/index.ts',
        'src/generator.ts',
        'src/__fixtures__/**',
      ],
      // Raised off the anomalous 60% branch floor. Current is 92.26/86.5/96.87/94.82,
      // so these floors gate regression with headroom. Ratchet up over time.
      thresholds: {
        branches: 75,
        functions: 88,
        lines: 85,
        statements: 85,
      },
      reporter: ['text', ['lcov', { projectRoot: '../../' }]],
    },
  },
})
