import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { parseSpec } from '../parser.js'
import { generateTypes } from '../plugins/types.js'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { compileSingleFile } from './helpers.js'

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

    if (diagnostics.length > 0) {
      const messages = diagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        .join('\n')
      throw new Error(`TypeScript errors in generated output for "${name}":\n${messages}`)
    }

    expect(diagnostics.length).toBe(0)
  })
})
