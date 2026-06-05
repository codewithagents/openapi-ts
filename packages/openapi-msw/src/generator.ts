// fallow-ignore-file code-duplication
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseSpec } from 'openapi-zod-ts'
import { loadConfig } from './config.js'
import { generateHandlers } from './plugins/handlers.js'

async function formatTs(content: string, filePath: string): Promise<string> {
  const { format, resolveConfig } = await import('prettier')
  const config = await resolveConfig(filePath)
  return format(content, { ...config, parser: 'typescript' })
}

export async function generate(cwd: string, configPath?: string): Promise<void> {
  const config = await loadConfig(cwd, configPath)
  const inputPath = resolve(cwd, config.input_openapi)
  const outputDir = resolve(cwd, config.output)
  const spec = await parseSpec(inputPath)

  const file = generateHandlers(spec, {
    seed: config.seed ?? 42,
    maxArrayItems: config.max_array_items ?? 3,
    depthCap: config.depth_cap ?? 30,
  })

  await mkdir(outputDir, { recursive: true })
  const filePath = join(outputDir, file.filename)
  await writeFile(filePath, await formatTs(file.content, filePath), 'utf-8')
  console.log(`✓ ${file.filename}`)
}
