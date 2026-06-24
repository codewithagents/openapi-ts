import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { check } from 'prettier'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { generate } from '../generator.js'

const taskApiFixture = join(import.meta.dirname, '../__fixtures__/specs/task-api.json')
const cyclicSchemasFixture = join(import.meta.dirname, '../__fixtures__/specs/cyclic-schemas.json')

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir) {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
  vi.restoreAllMocks()
})

async function makeConfig(
  specPath: string,
  extra: Record<string, unknown> = {}
): Promise<{ tmpDir: string; configPath: string; outDir: string; schemaPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'openapi-zod-ts-schema-test-'))
  tmpDir = dir
  const outDir = join(dir, 'generated')
  const schemaPath = join(dir, 'schemas.ts')
  const configPath = join(dir, 'openapi-zod-ts.config.json')
  await writeFile(
    configPath,
    JSON.stringify({ input_openapi: specPath, output: outDir, input_schema: schemaPath, ...extra }),
    'utf-8'
  )
  return { tmpDir: dir, configPath, outDir, schemaPath }
}

// ── First-run: bootstrap ───────────────────────────────────────────────────────

describe('schema-enhanced mode — first run (bootstrap)', () => {
  it('bootstraps schemas.ts when input_schema does not exist yet', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    const content = await readFile(schemaPath, 'utf-8')
    expect(content).toContain('z.object(')
  })

  it('bootstrapped schemas.ts contains a schema for each OpenAPI component schema', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    const content = await readFile(schemaPath, 'utf-8')
    // task-api.json has Task, TaskPage, CreateTaskRequest, UpdateTaskRequest schemas
    expect(content).toContain('TaskSchema')
    expect(content).toContain('CreateTaskRequestSchema')
  })

  it('also generates models.ts, client.ts, index.ts on first run', async () => {
    const { configPath, tmpDir: dir, outDir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    await expect(access(join(outDir, 'models.ts'))).resolves.toBeUndefined()
    await expect(access(join(outDir, 'client.ts'))).resolves.toBeUndefined()
    await expect(access(join(outDir, 'index.ts'))).resolves.toBeUndefined()
  })
})

// ── Second-run: schema-enhanced re-generation ─────────────────────────────────

describe('schema-enhanced mode — second run (re-generate with z.infer)', () => {
  it('models.ts uses z.infer types on second run', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath) // first: bootstrap
    await generate(dir, configPath) // second: schema-enhanced
    const models = await readFile(join(dir, 'generated', 'models.ts'), 'utf-8')
    expect(models).toContain('z.infer')
  })

  it('client.ts includes Zod parse calls on second run', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    await generate(dir, configPath)
    const client = await readFile(join(dir, 'generated', 'client.ts'), 'utf-8')
    expect(client).toContain('.parse(')
  })

  it('does NOT overwrite schemas.ts on second run', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    const original = await readFile(schemaPath, 'utf-8')
    await writeFile(schemaPath, original + '\n// user customisation', 'utf-8')
    await generate(dir, configPath)
    const after = await readFile(schemaPath, 'utf-8')
    expect(after).toContain('// user customisation')
  })

  it('schema-enhanced models.ts is Prettier-clean', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    await generate(dir, configPath)
    const content = await readFile(join(dir, 'generated', 'models.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })

  it('schema-enhanced client.ts is Prettier-clean', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath)
    await generate(dir, configPath)
    const content = await readFile(join(dir, 'generated', 'client.ts'), 'utf-8')
    expect(await check(content, { parser: 'typescript' })).toBe(true)
  })
})

// ── Drift detection ────────────────────────────────────────────────────────────

describe('schema-enhanced mode — drift detection', () => {
  it('warns to stderr when a spec schema has no matching schema in input_schema', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)

    // Pre-write a schema file that only covers some spec schemas (omits Tag and CreateTaskRequest)
    // so the generator will warn about the missing ones
    await writeFile(
      schemaPath,
      [
        "import { z } from 'zod'",
        'export const TaskStatusSchema = z.enum(["pending", "in_progress", "done"])',
        'export const TaskSchema = z.object({ id: z.string(), title: z.string() })',
        // TagSchema and CreateTaskRequestSchema intentionally omitted → drift
      ].join('\n'),
      'utf-8'
    )

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await generate(dir, configPath)
    const warned = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n')
    // Generator should warn about Tag and CreateTaskRequest being missing
    expect(warned).toContain('Tag')
    expect(warned.toLowerCase()).toContain('drift')
  })

  it('does NOT warn when all spec schemas are present in input_schema', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath) // bootstrap

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await generate(dir, configPath) // re-generate with full schema file
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// ── Drift gate (#336): --check flag and config.drift === 'error' ───────────────

describe('schema-enhanced mode: drift gate (#336)', () => {
  // A schema file that omits TagSchema and CreateTaskRequestSchema, so the spec drifts.
  const partialSchema = [
    "import { z } from 'zod'",
    'export const TaskStatusSchema = z.enum(["pending", "in_progress", "done"])',
    'export const TaskSchema = z.object({ id: z.string(), title: z.string() })',
  ].join('\n')

  it('check mode throws when a required schema is missing from input_schema', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)
    await writeFile(schemaPath, partialSchema, 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generate(dir, { configPath, check: true })).rejects.toThrow(/drift/i)
  })

  it("config.drift 'error' throws when drift is detected", async () => {
    const {
      configPath,
      tmpDir: dir,
      schemaPath,
    } = await makeConfig(taskApiFixture, {
      drift: 'error',
    })
    await writeFile(schemaPath, partialSchema, 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generate(dir, configPath)).rejects.toThrow(/drift/i)
  })

  it("config.drift 'error' failure is atomic: no output files are written", async () => {
    const {
      configPath,
      tmpDir: dir,
      outDir,
      schemaPath,
    } = await makeConfig(taskApiFixture, {
      drift: 'error',
    })
    await writeFile(schemaPath, partialSchema, 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generate(dir, configPath)).rejects.toThrow(/drift/i)
    // The drift gate runs before any writes, so the output directory stays empty.
    await expect(access(join(outDir, 'models.ts'))).rejects.toThrow()
    await expect(access(join(outDir, 'client.ts'))).rejects.toThrow()
  })

  it("config.drift 'warn' (the default) only warns and does NOT throw on drift", async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(taskApiFixture)
    await writeFile(schemaPath, partialSchema, 'utf-8')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(generate(dir, configPath)).resolves.toBeUndefined()
  })

  it('check mode throws when the input_schema file does not exist', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(taskApiFixture)
    // schemas.ts is never created, so check mode reports it as drift.
    await expect(generate(dir, { configPath, check: true })).rejects.toThrow(
      /does not exist|drift/i
    )
  })

  it('check mode writes no files when schemas are in sync', async () => {
    const { configPath, tmpDir: dir, outDir } = await makeConfig(taskApiFixture)
    await generate(dir, configPath) // bootstrap a full, in-sync schema + generated files
    const { rm } = await import('node:fs/promises')
    await rm(outDir, { recursive: true, force: true })
    await expect(generate(dir, { configPath, check: true })).resolves.toBeUndefined()
    // No writes in check mode: the generated dir must not be recreated.
    await expect(access(join(outDir, 'models.ts'))).rejects.toThrow()
  })
})

// ── Regression: cyclic schemas produce concrete types, not unknown (#383) ─────

describe('schema-enhanced mode — cyclic schemas resolve to concrete types (#383)', () => {
  it('models.ts emits concrete interfaces for cyclic types (not unknown) after second run', async () => {
    const { configPath, tmpDir: dir } = await makeConfig(cyclicSchemasFixture)
    await generate(dir, configPath) // first: bootstrap schemas.ts
    await generate(dir, configPath) // second: schema-enhanced re-generation

    const models = await readFile(join(dir, 'generated', 'models.ts'), 'utf-8')

    // With the bug, z.infer<typeof HolidaySchema> and z.infer<typeof ProvinceSchema>
    // both collapsed to unknown. Cyclic types are now emitted as concrete interfaces.
    expect(models).not.toContain('Holiday = unknown')
    expect(models).not.toContain('Province = unknown')
    expect(models).toMatch(/export interface Holiday \{/)
    expect(models).toMatch(/export interface Province \{/)

    // The interfaces reference each other (mutual cycle), proving concrete resolution.
    expect(models).toMatch(/provinces\?: Province\[\]/)
    expect(models).toMatch(/nextHoliday\?: Holiday/)

    // A cyclic interface referencing an acyclic schema (Province -> Region) resolves to an
    // in-scope model type, and the acyclic Region is still declared in models.ts.
    expect(models).toMatch(/region\?: Region/)
    expect(models).toMatch(/(export interface Region \{|export type Region =)/)
  })

  it('bootstrapped schemas.ts uses assertion form for cyclic schemas, not annotation form', async () => {
    const { configPath, tmpDir: dir, schemaPath } = await makeConfig(cyclicSchemasFixture)
    await generate(dir, configPath) // bootstrap

    const schemas = await readFile(schemaPath, 'utf-8')

    // Holiday and Province are mutually cyclic: both wrapped in z.lazy() and cast with
    // the assertion form `as z.ZodType<T>` so that z.infer resolves to the concrete model.
    // The annotation form (: z.ZodType<T> = ...) was fragile for all-optional recursive
    // schemas with .passthrough() under older TS/Zod combinations.
    expect(schemas).toContain('as z.ZodType<Holiday>')
    expect(schemas).toContain('as z.ZodType<Province>')
    expect(schemas).not.toContain('HolidaySchema: z.ZodType<Holiday>')
    expect(schemas).not.toContain('ProvinceSchema: z.ZodType<Province>')
    expect(schemas).toMatch(/import type \{[^}]*\} from '\.\/models\.js'/)

    // No helper interfaces are emitted into the user-owned schemas.ts.
    expect(schemas).not.toContain('interface _')

    // Acyclic schemas (Error, Region) remain plain assignments with no annotation or assertion.
    expect(schemas).toContain('ErrorSchema =')
    expect(schemas).not.toContain('ErrorSchema: z.ZodType')
    expect(schemas).not.toContain('ErrorSchema as z.ZodType')
    expect(schemas).toContain('RegionSchema =')
    expect(schemas).not.toContain('RegionSchema: z.ZodType')
    expect(schemas).not.toContain('RegionSchema as z.ZodType')
  })
})
