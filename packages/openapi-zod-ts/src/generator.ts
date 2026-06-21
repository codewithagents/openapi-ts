import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { loadConfig, loadConfigs, type Config } from './config.js'
import { runProjects } from './config-core.js'
import { parseSpec } from './parser.js'
import { generateTypes } from './plugins/types.js'
import { generateClientConfig } from './plugins/client-config.js'
import { generateClient, hasCookieAuth, detectAuthSchemes } from './plugins/client.js'
import { generateZodSchemas, collectSynthesizedResponseSchemaNames } from './plugins/zod.js'
import { generateIndexBarrel } from './plugins/index-barrel.js'
import { generateServer } from './plugins/server.js'
import { buildWritableVariantMap } from './utils/writable-variants.js'

/** Options accepted by generate(). */
export interface GenerateOptions {
  /** Path to config file. */
  configPath?: string
  /** Overrides config.input_openapi. Resolved from shell CWD before this call. */
  inputOverride?: string
  /** Overrides config.output. Resolved from shell CWD before this call. */
  outputOverride?: string
  /**
   * When true, run in read-only check mode: no files are written and any schema
   * drift is treated as an error (regardless of config.drift). Exits non-zero on drift.
   * Incompatible with watch mode.
   */
  check?: boolean
}

async function formatTs(content: string, filePath: string): Promise<string> {
  const { format, resolveConfig } = await import('prettier')
  const config = await resolveConfig(filePath)
  return format(content, { ...config, parser: 'typescript' })
}

/** Apply --input/--output overrides to an already-loaded config. */
function applyOverrides(config: Config, opts: GenerateOptions): Config {
  const result = { ...config }
  if (opts.inputOverride !== undefined) {
    result.input_openapi = opts.inputOverride
  }
  if (opts.outputOverride !== undefined) {
    result.output = opts.outputOverride
  }
  return result
}

/**
 * Run generation for a single resolved config. Used internally by generate()
 * for both single-spec and each project in a multi-spec config.
 * The optional label prefix is shown in log output when running multiple projects.
 */
// fallow-ignore-next-line complexity
async function generateOne(
  cwd: string,
  config: Config,
  opts: GenerateOptions,
  label?: string
): Promise<void> {
  // When overrides supply absolute paths, resolve them directly; otherwise resolve from cwd.
  const inputPath =
    opts.inputOverride !== undefined ? opts.inputOverride : resolve(cwd, config.input_openapi)
  const outputDir =
    opts.outputOverride !== undefined ? opts.outputOverride : resolve(cwd, config.output)

  const prefix = label !== undefined ? `[${label}] ` : ''

  console.log(`${prefix}Parsing spec: ${inputPath}`)
  const spec = await parseSpec(inputPath)

  // Build the writable-variant map exactly once so types.ts and client.ts share
  // the same computation. Both generators fall back to building it internally when
  // the map is not supplied (backward-compatible for direct callers).
  const writableVariantMap = buildWritableVariantMap(spec)

  const generatedFiles = []

  // Phase 1: always generate types
  generatedFiles.push(generateTypes(spec, undefined, writableVariantMap))

  // Phase 2: always generate client config, fetch client, and barrel index
  const cookieAuth = hasCookieAuth(spec)
  const authSchemes = detectAuthSchemes(spec)
  generatedFiles.push(
    generateClientConfig(
      cookieAuth ? { defaultCredentials: 'include', authSchemes } : { authSchemes }
    )
  )
  generatedFiles.push(
    generateClient(
      spec,
      {
        errorBodyType: config.error_body_type,
        errorBodyTypeImport: config.error_body_type_import,
      },
      writableVariantMap
    )
  )
  generatedFiles.push(generateIndexBarrel())

  const check = opts.check === true

  if (!check) {
    console.log(`${prefix}Writing output to: ${outputDir}`)
    await mkdir(outputDir, { recursive: true })

    for (const file of generatedFiles) {
      const filePath = join(outputDir, file.filename)
      await writeFile(filePath, await formatTs(file.content, filePath), 'utf-8')
      console.log(`${prefix}  ✓ ${file.filename}`)
    }

    // Phase 3: optional server client factory
    if (config.server_client === true) {
      const serverFile = generateServer(spec)
      const serverFilePath = join(outputDir, serverFile.filename)
      await writeFile(serverFilePath, await formatTs(serverFile.content, serverFilePath), 'utf-8')
      console.log(`${prefix}  ✓ ${serverFile.filename}`)
    }
  } else {
    console.log(`${prefix}Check mode: skipping all file writes.`)
  }

  // Phase 4: Zod schema bootstrap. Write once, never overwrite.
  if (config.input_schema !== undefined) {
    await generateZodIntegration(cwd, config, spec, outputDir, prefix, writableVariantMap, check)
  }

  console.log(`${prefix}Done! Generated ${generatedFiles.length} file(s).`)
}

// fallow-ignore-next-line complexity
async function generateZodIntegration(
  cwd: string,
  config: Config,
  spec: Awaited<ReturnType<typeof parseSpec>>,
  outputDir: string,
  prefix: string,
  writableVariantMap: ReturnType<typeof buildWritableVariantMap>,
  check: boolean
): Promise<void> {
  const schemaPath = resolve(cwd, config.input_schema!)
  let schemaExists = false
  try {
    await access(schemaPath)
    schemaExists = true
  } catch {
    // file does not exist
  }

  // Collect all drift signals before deciding whether to throw or warn.
  const driftMessages: string[] = []

  if (!schemaExists) {
    if (check) {
      // In check mode a missing schema file is itself a drift error.
      driftMessages.push(
        `input_schema file ${config.input_schema} does not exist; run generate to bootstrap it`
      )
    } else {
      // Normal mode: bootstrap the schema file.
      const zodFile = generateZodSchemas(spec)
      await writeFile(schemaPath, zodFile.content, 'utf-8')
      console.log(
        `${prefix}  ✓ ${config.input_schema} (bootstrapped: edit freely, won't be overwritten)`
      )
    }
  } else {
    console.log(
      `${prefix}Skipping ${config.input_schema}: already exists (edit freely, it's yours).`
    )

    // Phase 5: Schema-enhanced generation. Re-generate models.ts and client.ts with Zod integration.
    const content = await readFile(schemaPath, 'utf-8')
    const exportedSchemas = new Set<string>()
    for (const match of content.matchAll(/^export\s+const\s+(\w+Schema)\b/gm)) {
      exportedSchemas.add(match[1]!)
    }

    // Drift detection: collect missing component schemas.
    const specSchemaNames = Object.keys(spec.components?.schemas ?? {})
    for (const name of specSchemaNames) {
      if (!exportedSchemas.has(`${name}Schema`)) {
        const msg = `${prefix}Drift: ${name}Schema is in the OpenAPI spec but not found in ${config.input_schema}. Run with --reset-schema to re-bootstrap.`
        console.warn(msg)
        driftMessages.push(msg)
      }
    }

    // Drift detection: collect missing synthesized inline response schemas.
    // These are bootstrapped by generateZodSchemas() but may be absent if the file
    // predates this feature or if the user removed them accidentally.
    const synthesizedNames = collectSynthesizedResponseSchemaNames(spec)
    for (const schemaName of synthesizedNames) {
      if (!exportedSchemas.has(schemaName)) {
        const msg = `${prefix}Drift: ${schemaName} is synthesized from an inline response but not found in ${config.input_schema}. Run with --reset-schema to re-bootstrap, or add it manually.`
        console.warn(msg)
        driftMessages.push(msg)
      }
    }

    // Gate: throw when check mode or config.drift === 'error' and drift was detected.
    if (driftMessages.length > 0 && (check || config.drift === 'error')) {
      throw new Error(
        `Schema drift detected:\n${driftMessages.map((m) => `  - ${m}`).join('\n')}`
      )
    }

    if (!check) {
      // Compute relative import path for use in generated imports
      const relPath = relative(outputDir, schemaPath)
      // 'schemas.ts' -> './schemas.js', '../schemas.ts' -> '../schemas.js'
      const schemaImportPath =
        (relPath.startsWith('.') ? '' : './') + relPath.replace(/\.ts$/, '.js')

      // Re-generate (overwrite) models.ts and client.ts with schema-enhanced versions
      const enhancedTypes = generateTypes(
        spec,
        { schemaNames: exportedSchemas, schemaImportPath },
        writableVariantMap
      )
      const enhancedClient = generateClient(
        spec,
        {
          schemaNames: exportedSchemas,
          schemaImportPath,
          errorBodyType: config.error_body_type,
          errorBodyTypeImport: config.error_body_type_import,
        },
        writableVariantMap
      )
      const enhancedTypesPath = join(outputDir, enhancedTypes.filename)
      const enhancedClientPath = join(outputDir, enhancedClient.filename)
      await writeFile(
        enhancedTypesPath,
        await formatTs(enhancedTypes.content, enhancedTypesPath),
        'utf-8'
      )
      await writeFile(
        enhancedClientPath,
        await formatTs(enhancedClient.content, enhancedClientPath),
        'utf-8'
      )
      console.log(`${prefix}  ✓ models.ts (schema-enhanced, types from z.infer)`)
      console.log(`${prefix}  ✓ client.ts (schema-enhanced, Zod validation added)`)
    }
  }

  // Gate for check mode missing-file case (after the if/else above).
  if (driftMessages.length > 0 && check) {
    throw new Error(
      `Schema drift detected:\n${driftMessages.map((m) => `  - ${m}`).join('\n')}`
    )
  }
}

// fallow-ignore-next-line complexity
export async function generate(cwd: string, opts?: GenerateOptions | string): Promise<void> {
  // Back-compat: accept a plain configPath string as second arg (old call sites).
  const options: GenerateOptions = typeof opts === 'string' ? { configPath: opts } : (opts ?? {})

  console.log('Loading config...')

  // When --input AND --output are both provided we can skip loading a config file entirely.
  const skipConfig =
    options.inputOverride !== undefined &&
    options.outputOverride !== undefined &&
    options.configPath === undefined

  if (skipConfig) {
    const config: Config = {
      input_openapi: options.inputOverride as string,
      output: options.outputOverride as string,
    }
    await generateOne(cwd, config, options)
    return
  }

  // Overrides are incompatible with multi-spec "projects" array configs. When overrides
  // are present we fall back to single-spec loading so overrides apply to a single config.
  const hasOverrides =
    options.inputOverride !== undefined || options.outputOverride !== undefined

  if (hasOverrides) {
    const config = applyOverrides(await loadConfig(cwd, options.configPath), options)
    await generateOne(cwd, config, options)
    return
  }

  // No overrides: use the normalized loadConfigs API to support both single-spec
  // and multi-spec ("projects" array) configs uniformly.
  const configs = await loadConfigs(cwd, options.configPath)
  await runProjects(configs, (config, label) => generateOne(cwd, config, options, label))
}
