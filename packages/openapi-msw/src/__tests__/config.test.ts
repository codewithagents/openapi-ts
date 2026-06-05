import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig } from '../config.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir) {
    const { rm } = await import('node:fs/promises')
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

async function writeConfig(obj: Record<string, unknown>): Promise<{ cwd: string; configPath: string }> {
  tmpDir = await mkdtemp(join(tmpdir(), 'openapi-msw-config-test-'))
  const configPath = join(tmpDir, 'openapi-msw.config.json')
  await writeFile(configPath, JSON.stringify(obj), 'utf-8')
  return { cwd: tmpDir, configPath }
}

describe('loadConfig: valid config', () => {
  it('loads required fields with defaults', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
    })
    const config = await loadConfig(cwd, configPath)
    expect(config.input_openapi).toBe('spec.json')
    expect(config.output).toBe('generated')
    expect(config.seed).toBeUndefined()
    expect(config.max_array_items).toBeUndefined()
    expect(config.depth_cap).toBeUndefined()
  })

  it('loads optional fields when provided', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      seed: 0,
      max_array_items: 5,
      depth_cap: 10,
    })
    const config = await loadConfig(cwd, configPath)
    expect(config.seed).toBe(0)
    expect(config.max_array_items).toBe(5)
    expect(config.depth_cap).toBe(10)
  })
})

describe('loadConfig: invalid field values', () => {
  it('rejects non-integer seed', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      seed: 1.5,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"seed" must be an integer')
  })

  it('rejects negative seed', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      seed: -1,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"seed" must be >= 0')
  })

  it('rejects zero max_array_items', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      max_array_items: 0,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"max_array_items" must be >= 1')
  })

  it('rejects non-integer max_array_items', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      max_array_items: 2.5,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"max_array_items" must be an integer')
  })

  it('rejects zero depth_cap', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      depth_cap: 0,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"depth_cap" must be >= 1')
  })

  it('rejects non-integer depth_cap', async () => {
    const { cwd, configPath } = await writeConfig({
      input_openapi: 'spec.json',
      output: 'generated',
      depth_cap: 3.7,
    })
    await expect(loadConfig(cwd, configPath)).rejects.toThrow('"depth_cap" must be an integer')
  })
})
