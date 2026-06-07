import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { parseSpec } from 'openapi-zod-ts'
import { runProjects } from 'openapi-zod-ts/config-core'
import { loadConfigs, type ServerConfig } from './config.js'
import { generateService } from './plugins/service.js'
import { generateRouter, generateExpressRouter, generateFastifyRouter } from './plugins/router.js'

async function formatTs(content: string, filePath: string): Promise<string> {
  const { format, resolveConfig } = await import('prettier')
  const config = await resolveConfig(filePath)
  return format(content, { ...config, parser: 'typescript' })
}

/** Pick the framework-specific router generator for a first or second pass. */
function buildRouterFile(
  spec: Awaited<ReturnType<typeof parseSpec>>,
  framework: 'hono' | 'express' | 'fastify',
  options?: Parameters<typeof generateRouter>[1]
): ReturnType<typeof generateRouter> {
  if (framework === 'hono') return generateRouter(spec, options)
  if (framework === 'express') return generateExpressRouter(spec, options)
  return generateFastifyRouter(spec, options)
}

// fallow-ignore-next-line complexity
async function generateOne(cwd: string, config: ServerConfig, label?: string): Promise<void> {
  const inputPath = resolve(cwd, config.input_openapi)
  const outputDir = resolve(cwd, config.output)
  const framework = config.framework ?? 'none'
  const prefix = label !== undefined ? `[${label}] ` : ''

  console.log(`${prefix}Parsing spec: ${inputPath}`)
  const spec = await parseSpec(inputPath)

  const generatedFiles = [generateService(spec)]

  if (framework !== 'none') {
    generatedFiles.push(buildRouterFile(spec, framework))
  }

  console.log(`${prefix}Writing output to: ${outputDir}`)
  await mkdir(outputDir, { recursive: true })

  for (const file of generatedFiles) {
    const filePath = join(outputDir, file.filename)
    await writeFile(filePath, await formatTs(file.content, filePath), 'utf-8')
    console.log(`${prefix}  ✓ ${file.filename}`)
  }

  // Second pass: if input_schema is configured and file exists, re-generate router with Zod validation
  if (framework !== 'none' && config.input_schema !== undefined) {
    await generateSchemaEnhancedRouter(cwd, config, spec, framework, outputDir, prefix)
  }

  console.log(`${prefix}Done! Generated ${generatedFiles.length} file(s).`)
}

async function generateSchemaEnhancedRouter(
  cwd: string,
  config: ServerConfig,
  spec: Awaited<ReturnType<typeof parseSpec>>,
  framework: 'hono' | 'express' | 'fastify',
  outputDir: string,
  prefix: string
): Promise<void> {
  const schemaPath = resolve(cwd, config.input_schema!)
  let schemaContent: string
  try {
    schemaContent = await readFile(schemaPath, 'utf-8')
  } catch {
    console.log(`${prefix}  input_schema not found at ${schemaPath}, skipping Zod validation`)
    return
  }

  // Extract exported schema names from the schema file
  const exportedSchemas = new Set<string>()
  for (const match of schemaContent.matchAll(/^export\s+const\s+(\w+Schema)\b/gm)) {
    exportedSchemas.add(match[1]!)
  }

  if (exportedSchemas.size === 0) return

  // Compute relative import path from outputDir to schemaPath
  const relPath = relative(outputDir, schemaPath).replace(/\\/g, '/')
  const schemaImportPath = relPath.startsWith('.') ? relPath : `./${relPath}`
  const schemaImportPathJs = schemaImportPath.replace(/\.ts$/, '.js')

  const routerFile = buildRouterFile(spec, framework, {
    schemaNames: exportedSchemas,
    schemaImportPath: schemaImportPathJs,
  })
  const routerPath = join(outputDir, routerFile.filename)
  await writeFile(routerPath, await formatTs(routerFile.content, routerPath), 'utf-8')
  console.log(`${prefix}  ✓ router.ts (with Zod validation for ${exportedSchemas.size} schema(s))`)
}

export async function generate(cwd: string, configPath?: string): Promise<void> {
  console.log('Loading config...')
  const configs = await loadConfigs(cwd, configPath)
  await runProjects(configs, (config, label) => generateOne(cwd, config, label))
}
