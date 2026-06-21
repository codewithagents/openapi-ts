import { resolve } from 'node:path'
import { type CliAction as BaseCliAction, parseBaseCliArgs } from './cli-core.js'

/** The parsed result of CLI arguments. */
export type CliAction =
  | { action: 'help' }
  | { action: 'version' }
  | {
      action: 'run'
      configFile?: string
      cwd: string
      /** Overrides config input_openapi when provided via --input */
      inputOverride?: string
      /** Overrides config output when provided via --output */
      outputOverride?: string
      watch: boolean
      /**
       * When true, run in read-only check mode: no files are written, any drift
       * is treated as an error, and the process exits non-zero on drift.
       * Incompatible with --watch.
       */
      check: boolean
      /**
       * When true, overwrite the input_schema file with a fresh bootstrap from the
       * spec (the re-bootstrap remedy that drift messages point to). Destructive:
       * any customizations in the schema file are replaced. Incompatible with --check
       * (read-only) and --watch (one-shot).
       */
      resetSchema: boolean
    }
  | { action: 'error'; message: string }

const CONFIG_USAGE = 'Usage: openapi-zod-ts [--config <path-to-config.json>]'

/**
 * Parse raw process.argv into a structured action.
 *
 * Pure function: no I/O, no process.exit. Testable in isolation.
 *
 * @param argv  process.argv (first two entries are node + script path)
 * @param cwd   the working directory to resolve paths against
 */
// fallow-ignore-next-line complexity
export function parseCliArgs(argv: string[], cwd: string): CliAction {
  const args = argv.slice(2)

  const base: BaseCliAction = parseBaseCliArgs(argv, cwd, CONFIG_USAGE)

  if (base.action === 'help' || base.action === 'version' || base.action === 'error') {
    return base
  }

  const watch = args.includes('--watch')
  const check = args.includes('--check')
  const resetSchema = args.includes('--reset-schema')

  if (check && watch) {
    return {
      action: 'error',
      message:
        'Error: --check and --watch cannot be used together. ' +
        '--check is a read-only one-shot verification; it cannot watch for changes.',
    }
  }

  if (resetSchema && check) {
    return {
      action: 'error',
      message:
        'Error: --reset-schema and --check cannot be used together. ' +
        '--check is read-only; --reset-schema rewrites the input_schema file.',
    }
  }

  if (resetSchema && watch) {
    return {
      action: 'error',
      message:
        'Error: --reset-schema and --watch cannot be used together. ' +
        '--reset-schema is a one-shot re-bootstrap, not a continuous mode.',
    }
  }

  let inputOverride: string | undefined
  const inputIdx = args.indexOf('--input')
  if (inputIdx !== -1) {
    const next = args[inputIdx + 1]
    if (next === undefined || next.startsWith('--')) {
      return {
        action: 'error',
        message: [
          'Error: --input requires a file path argument',
          'Usage: openapi-zod-ts [--input <path-to-spec>]',
        ].join('\n'),
      }
    }
    inputOverride = resolve(cwd, next)
  }

  let outputOverride: string | undefined
  const outputIdx = args.indexOf('--output')
  if (outputIdx !== -1) {
    const next = args[outputIdx + 1]
    if (next === undefined || next.startsWith('--')) {
      return {
        action: 'error',
        message: [
          'Error: --output requires a directory path argument',
          'Usage: openapi-zod-ts [--output <output-dir>]',
        ].join('\n'),
      }
    }
    outputOverride = resolve(cwd, next)
  }

  return {
    action: 'run',
    configFile: base.configFile,
    cwd: base.cwd,
    ...(inputOverride !== undefined && { inputOverride }),
    ...(outputOverride !== undefined && { outputOverride }),
    watch,
    check,
    resetSchema,
  }
}
