import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { check } from 'prettier'
import { describe, it, expect, afterEach } from 'vitest'
import { generate } from '../generator.js'

const petstoreFixture = join(import.meta.dirname, '../__fixtures__/petstore.json')

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir) {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function runGenerator(extra: Record<string, unknown> = {}): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'openapi-server-prettier-test-'))
  const configPath = join(tmpDir, 'openapi-server.config.json')
  const outDir = join(tmpDir, 'generated')
  await writeFile(
    configPath,
    JSON.stringify({ input_openapi: petstoreFixture, output: outDir, ...extra }),
    'utf-8'
  )
  await generate(tmpDir, configPath)
  return outDir
}

// ── B1: generator conditional — zero-cast path only with input_schema ─────────
//
// Regression: generator.ts:71 gate must hold. When framework=fastify but no
// input_schema is configured, the generator must NOT write schema-types.ts
// and service.ts must still import from ./models.js (models-typed path).

describe('generator conditional: fastify without input_schema stays on models path', () => {
  it('does not emit schema-types.ts when input_schema is absent', async () => {
    const outDir = await runGenerator({ framework: 'fastify' })
    await expect(access(join(outDir, 'schema-types.ts'))).rejects.toThrow()
  })

  it('service.ts imports from models.js when input_schema is absent', async () => {
    const outDir = await runGenerator({ framework: 'fastify' })
    const content = await readFile(join(outDir, 'service.ts'), 'utf-8')
    // Prettier may normalise quote style; check for the module path regardless.
    expect(content).toContain('models.js')
    expect(content).not.toContain('schema-types.js')
  })
})

describe('generated output is Prettier-clean', () => {
  it('service.ts is Prettier-clean', async () => {
    const outDir = await runGenerator()
    const content = await readFile(join(outDir, 'service.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })

  it('router.ts is Prettier-clean (hono framework)', async () => {
    const outDir = await runGenerator({ framework: 'hono' })
    const content = await readFile(join(outDir, 'router.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })

  it('router.ts is Prettier-clean (express framework)', async () => {
    const outDir = await runGenerator({ framework: 'express' })
    const content = await readFile(join(outDir, 'router.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })

  it('router.ts is Prettier-clean (fastify framework)', async () => {
    const outDir = await runGenerator({ framework: 'fastify' })
    const content = await readFile(join(outDir, 'router.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })
})
