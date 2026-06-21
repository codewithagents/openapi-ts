import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { loadConfig, loadConfigs, type Config } from './config.js'
import { runProjects } from './config-core.js'
import { parseSpec } from './parser.js'
import { generateTypes } from './plugins/types.js'
import { generateClientConfig } from './plugins/client-config.js'
import { generateClient, hasCookieAuth, detectAuthSchemes } from './plugins/client.js'
import { generateZodSchemas } from './plugins/zod.js'
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
  /**
   * When true, overwrite the input_schema file with a fresh bootstrap from the spec
   * (the re-bootstrap remedy for drift). Drift is not gated on this run since the file
   * is being regenerated. Destructive: customizations in the schema file are replaced.
   */
  resetSchema?: boolean
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
  const resetSchema = opts.resetSchema === true

  // Drift detection is a read-only pass that runs BEFORE any writes. This keeps
  // generation atomic: when a drift gate fails, the output directory is left
  // untouched rather than half-written. It also gives a single gate site.
  // --reset-schema is the remedy for drift, so it never gates: the schema file is
  // about to be re-bootstrapped from the spec anyway.
  let driftPlan: SchemaDriftPlan | undefined
  if (config.input_schema !== undefined) {
    const schemaPath = resolve(cwd, config.input_schema)
    driftPlan = await detectSchemaDrift(config, spec, schemaPath, check)
    for (const msg of driftPlan.driftMessages) {
      console.warn(`${prefix}Drift: ${msg}`)
    }
    if (driftPlan.driftMessages.length > 0 && !resetSchema && (check || config.drift === 'error')) {
      throw new Error(
        `Schema drift detected:\n${driftPlan.driftMessages.map((m) => `  - ${m}`).join('\n')}`
      )
    }
  }

  // Check mode is read-only: reaching here means no gated drift, so nothing to write.
  if (check) {
    console.log(`${prefix}Check mode: no drift detected, no files written.`)
    return
  }

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

  // Phase 4: Zod integration (bootstrap on first run, schema-enhanced thereafter).
  if (config.input_schema !== undefined && driftPlan !== undefined) {
    await writeZodIntegration(
      cwd,
      config,
      spec,
      outputDir,
      prefix,
      writableVariantMap,
      driftPlan,
      resetSchema
    )
  }

  console.log(`${prefix}Done! Generated ${generatedFiles.length} file(s).`)
}

/** Result of the read-only drift detection pass. */
interface SchemaDriftPlan {
  /** Whether the user-owned input_schema file already exists on disk. */
  schemaExists: boolean
  /** Schema export names found in the input_schema file (empty when it does not exist). */
  exportedSchemas: Set<string>
  /** Human-readable drift signals (without prefix); empty when the contract is in sync. */
  driftMessages: string[]
}

/**
 * Read-only drift detection between the OpenAPI spec and the user-owned input_schema
 * file. Writes nothing. The two gated signals are a missing component schema and a
 * missing synthesized inline-response schema. Extra exports are intentionally allowed
 * (users add their own FE-only or BE-only refinements). A missing schema file is only
 * drift in check mode (otherwise it is a normal first-run bootstrap).
 */
// fallow-ignore-next-line complexity
async function detectSchemaDrift(
  config: Config,
  spec: Awaited<ReturnType<typeof parseSpec>>,
  schemaPath: string,
  check: boolean
): Promise<SchemaDriftPlan> {
  let schemaExists = false
  try {
    await access(schemaPath)
    schemaExists = true
  } catch {
    // file does not exist
  }

  const exportedSchemas = new Set<string>()
  const driftMessages: string[] = []

  if (!schemaExists) {
    if (check) {
      driftMessages.push(
        `input_schema file ${config.input_schema} does not exist; run generate to bootstrap it`
      )
    }
    return { schemaExists, exportedSchemas, driftMessages }
  }

  const content = await readFile(schemaPath, 'utf-8')
  for (const match of content.matchAll(/^export\s+const\s+(\w+Schema)\b/gm)) {
    exportedSchemas.add(match[1]!)
  }

  // The expected schema set is exactly what a fresh bootstrap would emit, so the
  // checker and the bootstrapper stay in lockstep: a file produced by --reset-schema
  // always passes --check. Deriving expectations from generateZodSchemas() (rather than
  // re-deriving them from spec.components plus synthesized names) avoids flagging schemas
  // the bootstrapper intentionally inlines (e.g. discriminated-union members) or does
  // not synthesize. Extra user exports remain allowed (FE-only or BE-only refinements).
  const bootstrapped = generateZodSchemas(spec).content
  for (const match of bootstrapped.matchAll(/^export\s+const\s+(\w+Schema)\b/gm)) {
    const schemaName = match[1]!
    if (!exportedSchemas.has(schemaName)) {
      driftMessages.push(
        `${schemaName} is in the OpenAPI contract but not found in ${config.input_schema}. Run with --reset-schema to re-bootstrap.`
      )
    }
  }

  return { schemaExists, exportedSchemas, driftMessages }
}

/**
 * Write the Zod integration files. Only called in non-check mode after the drift
 * gate has passed. On first run it bootstraps the input_schema file (write once,
 * never overwritten). On subsequent runs it re-generates models.ts and client.ts
 * with Zod validation using the schema names discovered during drift detection.
 */
async function writeZodIntegration(
  cwd: string,
  config: Config,
  spec: Awaited<ReturnType<typeof parseSpec>>,
  outputDir: string,
  prefix: string,
  writableVariantMap: ReturnType<typeof buildWritableVariantMap>,
  plan: SchemaDriftPlan,
  resetSchema: boolean
): Promise<void> {
  const schemaPath = resolve(cwd, config.input_schema!)

  if (!plan.schemaExists || resetSchema) {
    // First run bootstraps the schema file (write once). --reset-schema force-rewrites
    // an existing file from the spec, which is how a user clears reported drift. Either
    // way the schema-enhanced regeneration of models/client/router happens on the next
    // run, against the freshly written file.
    const zodFile = generateZodSchemas(spec)
    await writeFile(schemaPath, zodFile.content, 'utf-8')
    console.log(
      resetSchema && plan.schemaExists
        ? `${prefix}  ✓ ${config.input_schema} (reset: re-bootstrapped from the spec, customizations overwritten)`
        : `${prefix}  ✓ ${config.input_schema} (bootstrapped: edit freely, won't be overwritten)`
    )
    return
  }

  console.log(
    `${prefix}Skipping ${config.input_schema}: already exists (edit freely, it's yours).`
  )

  // Compute relative import path for use in generated imports.
  // 'schemas.ts' -> './schemas.js', '../schemas.ts' -> '../schemas.js'
  const relPath = relative(outputDir, schemaPath)
  const schemaImportPath = (relPath.startsWith('.') ? '' : './') + relPath.replace(/\.ts$/, '.js')

  // Re-generate (overwrite) models.ts and client.ts with schema-enhanced versions.
  const enhancedTypes = generateTypes(
    spec,
    { schemaNames: plan.exportedSchemas, schemaImportPath },
    writableVariantMap
  )
  const enhancedClient = generateClient(
    spec,
    {
      schemaNames: plan.exportedSchemas,
      schemaImportPath,
      errorBodyType: config.error_body_type,
      errorBodyTypeImport: config.error_body_type_import,
    },
    writableVariantMap
  )
  const enhancedTypesPath = join(outputDir, enhancedTypes.filename)
  const enhancedClientPath = join(outputDir, enhancedClient.filename)
  await writeFile(enhancedTypesPath, await formatTs(enhancedTypes.content, enhancedTypesPath), 'utf-8')
  await writeFile(
    enhancedClientPath,
    await formatTs(enhancedClient.content, enhancedClientPath),
    'utf-8'
  )
  console.log(`${prefix}  ✓ models.ts (schema-enhanced, types from z.infer)`)
  console.log(`${prefix}  ✓ client.ts (schema-enhanced, Zod validation added)`)
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
