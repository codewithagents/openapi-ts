import {
  loadConfigFile,
  loadConfigsFile,
  validateConfigPath,
  validateInputPath,
  validateOutputPath,
} from './config-core.js'

export { validateConfigPath, validateInputPath, validateOutputPath }

export interface Config {
  /** Path to the OpenAPI 3.1 spec file (JSON or YAML) */
  input_openapi: string
  /** Path to user-owned Zod schema file (.ts). Optional. Bootstrapped on first run if absent. */
  input_schema?: string
  /** Directory to write generated files */
  output: string
  /** Base URL prefix for generated fetch client (default: '') */
  baseUrl?: string
  /** When true, generates server.ts with a createServerClient() factory for Next.js RSC (default: false) */
  server_client?: boolean
}

/**
 * Typed identity helper for config files. Provides autocomplete in JS/TS config files.
 *
 * Example (openapi-zod-ts.config.mjs):
 *   import { defineConfig } from 'openapi-zod-ts'
 *   export default defineConfig({ input_openapi: './openapi.json', output: './src/api' })
 */
export function defineConfig(config: Config): Config {
  return config
}

/**
 * Typed helper for multi-spec config files. Use in JS/TS config files to get
 * autocomplete and type-checking for each project entry.
 *
 * Example (openapi-zod-ts.config.mjs):
 *   import { defineProjects } from 'openapi-zod-ts'
 *   export default defineProjects([
 *     { input_openapi: './services/users.json', output: './src/users' },
 *     { input_openapi: './services/orders.json', output: './src/orders' },
 *   ])
 */
export function defineProjects(configs: Config[]): { projects: Config[] } {
  return { projects: configs }
}

function parseConfig(raw: Record<string, unknown>, base: import('./config-core.js').BaseConfig): Config {
  if (
    raw['input_schema'] !== undefined &&
    (typeof raw['input_schema'] !== 'string' || !raw['input_schema'])
  ) {
    throw new Error('"input_schema" must be a non-empty string path to your Zod schema file')
  }
  if (raw['server_client'] !== undefined && typeof raw['server_client'] !== 'boolean') {
    throw new Error('"server_client" must be a boolean')
  }
  return {
    ...base,
    input_schema: raw['input_schema'] as string | undefined,
    baseUrl: typeof raw['baseUrl'] === 'string' ? raw['baseUrl'] : undefined,
    server_client: raw['server_client'] as boolean | undefined,
  }
}

export async function loadConfig(cwd: string, configPath?: string): Promise<Config> {
  return loadConfigFile<Config>({
    cwd,
    configPath,
    defaultFileName: 'openapi-zod-ts.config.json',
    parse: parseConfig,
  })
}

/**
 * Load a config file and return all configs as a normalized array.
 *
 * Single-spec config: returns a one-element array.
 * Multi-spec config with "projects" key: returns N-element array.
 *
 * This is the preferred API for generator call sites that need to handle
 * both single-spec and multi-spec configs uniformly.
 */
export async function loadConfigs(cwd: string, configPath?: string): Promise<Config[]> {
  return loadConfigsFile<Config>({
    cwd,
    configPath,
    defaultFileName: 'openapi-zod-ts.config.json',
    parse: parseConfig,
  })
}
