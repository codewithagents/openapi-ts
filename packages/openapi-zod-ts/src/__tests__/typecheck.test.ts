import { describe, it, expect } from 'vitest'
import { parseSpec } from '../parser.js'
import { generateTypes } from '../plugins/types.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { compileSingleFile, assertNoTsDiagnostics } from './helpers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, '../__fixtures__/specs')

const fixtures = [
  ['task-manager', join(fixturesDir, 'task-manager.json')],
  ['edge-cases', join(fixturesDir, 'edge-cases.json')],
  ['petstore', join(fixturesDir, 'petstore.json')],
] as const

describe('generated models.ts compiles with TypeScript strict mode', () => {
  it.each(fixtures)('%s: no TypeScript errors', async (name, fixturePath) => {
    const spec = await parseSpec(fixturePath)
    const { content } = generateTypes(spec)

    const diagnostics = compileSingleFile('models.ts', content)

    assertNoTsDiagnostics(diagnostics, `generated output for "${name}"`)
    expect(diagnostics.length).toBe(0)
  })
})
