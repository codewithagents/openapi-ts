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
  /**
   * Optional TypeScript type name for a caller context threaded through every service method.
   * When set, the generated interface becomes `XService<Ctx = never>` and each method
   * receives a final `ctx: Ctx` argument. The generated router passes the framework's
   * native request/context object (Hono: c, Express: req, Fastify: req) as ctx.
   *
   * Example: `"context_type": "RequestContext"`
   */
  context_type?: string
  /**
   * Fastify only. When true, the generated router emits inline Zod response schema
   * expressions in schema.response for operations with flat inline response schemas.
   * Operations with $ref, allOf, oneOf, anyOf, or nested schemas fall back to z.unknown().
   *
   * Default: false. For best coverage, wire input_schema with your Zod schema file and let
   * the generator use the exact schemas you own.
   */
  emit_response_validation?: boolean
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
  if (
    raw['context_type'] !== undefined &&
    (typeof raw['context_type'] !== 'string' || !raw['context_type'])
  ) {
    throw new Error('"context_type" must be a non-empty string TypeScript type name')
  }
  if (
    raw['emit_response_validation'] !== undefined &&
    typeof raw['emit_response_validation'] !== 'boolean'
  ) {
    throw new Error('"emit_response_validation" must be a boolean (true or false)')
  }
  return {
    ...base,
    framework: framework as 'hono' | 'express' | 'fastify' | 'none' | undefined,
    input_schema: raw['input_schema'] as string | undefined,
    context_type: raw['context_type'] as string | undefined,
    emit_response_validation: raw['emit_response_validation'] as boolean | undefined,
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
