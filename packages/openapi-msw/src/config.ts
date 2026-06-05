import {
  loadConfigFile,
  validateConfigPath,
  validateInputPath,
  validateOutputPath,
} from 'openapi-zod-ts/config-core'

// fallow-ignore-next-line unused-export
export { validateConfigPath, validateInputPath, validateOutputPath }

export interface MswConfig {
  /** Path to OpenAPI 3.1 spec file (JSON or YAML) */
  input_openapi: string
  /** Directory to write generated files */
  output: string
  /** Seed value passed to faker.seed() for deterministic output (default: 42) */
  seed?: number
  /** Maximum array length in generated mock data (default: 3) */
  max_array_items?: number
  /** Maximum schema recursion depth before emitting null (default: 30) */
  depth_cap?: number
}

function expectIntegerAtLeast(raw: Record<string, unknown>, key: string, min: number): void {
  const val = raw[key]
  if (val === undefined) return
  if (typeof val !== 'number' || !Number.isInteger(val)) {
    throw new Error(`"${key}" must be an integer`)
  }
  if (val < min) {
    throw new Error(`"${key}" must be >= ${min}`)
  }
}

function validateMswFields(raw: Record<string, unknown>): void {
  expectIntegerAtLeast(raw, 'seed', 0)
  expectIntegerAtLeast(raw, 'max_array_items', 1)
  expectIntegerAtLeast(raw, 'depth_cap', 1)
}

export async function loadConfig(cwd: string, configPath?: string): Promise<MswConfig> {
  return loadConfigFile<MswConfig>({
    cwd,
    configPath,
    defaultFileName: 'openapi-msw.config.json',
    parse: (raw, base) => {
      validateMswFields(raw)
      return {
        ...base,
        seed: raw['seed'] as number | undefined,
        max_array_items: raw['max_array_items'] as number | undefined,
        depth_cap: raw['depth_cap'] as number | undefined,
      }
    },
  })
}
