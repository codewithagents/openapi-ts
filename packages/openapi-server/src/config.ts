import {
  loadConfigFile,
  loadConfigsFile,
  validateConfigPath,
  validateInputPath,
  validateOutputPath,
} from 'openapi-zod-ts/config-core'

export { validateConfigPath, validateInputPath, validateOutputPath }

export interface ServerConfig {
  /** Path to the OpenAPI 3.1 spec file (JSON or YAML) */
  input_openapi: string
  /** Directory to write generated files */
  output: string
  /** Framework to generate a router for. Default: 'none' */
  framework?: 'hono' | 'express' | 'fastify' | 'none'
  /** Path to user-owned Zod schema file (same file as openapi-zod-ts's input_schema). Optional. */
  input_schema?: string
}

function parseServerConfig(
  raw: Record<string, unknown>,
  base: import('openapi-zod-ts/config-core').BaseConfig
): ServerConfig {
  const framework = raw['framework']
  if (
    framework !== undefined &&
    framework !== 'hono' &&
    framework !== 'express' &&
    framework !== 'fastify' &&
    framework !== 'none'
  ) {
    throw new Error('"framework" must be one of: "hono", "express", "fastify", or "none"')
  }
  if (
    raw['input_schema'] !== undefined &&
    (typeof raw['input_schema'] !== 'string' || !raw['input_schema'])
  ) {
    throw new Error('"input_schema" must be a non-empty string path to your Zod schema file')
  }
  return {
    ...base,
    framework: framework as 'hono' | 'express' | 'fastify' | 'none' | undefined,
    input_schema: raw['input_schema'] as string | undefined,
  }
}

export async function loadConfig(cwd: string, configPath?: string): Promise<ServerConfig> {
  return loadConfigFile<ServerConfig>({
    cwd,
    configPath,
    defaultFileName: 'openapi-server.config.json',
    parse: parseServerConfig,
  })
}

/**
 * Load a config file and return all configs as a normalized array.
 *
 * Single-spec config: returns a one-element array.
 * Multi-spec config with "projects" key: returns N-element array.
 */
export async function loadConfigs(cwd: string, configPath?: string): Promise<ServerConfig[]> {
  return loadConfigsFile<ServerConfig>({
    cwd,
    configPath,
    defaultFileName: 'openapi-server.config.json',
    parse: parseServerConfig,
  })
}
