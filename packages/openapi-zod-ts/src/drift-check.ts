import { appendFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The result of comparing in-memory generator output against files on disk.
 *
 * - `stale`: file exists on disk but its content differs from what the generator produces today
 * - `missing`: file expected by the generator but absent from disk
 * - `extra`: file found on disk that the generator would not produce (stale artifact or manual addition)
 */
export interface DriftReport {
  stale: Array<{ filename: string; reason: 'stale' }>
  missing: Array<{ filename: string; reason: 'missing' }>
  extra: Array<{ filename: string; reason: 'extra' }>
  /** Total count of drifted files across all three categories. */
  total: number
  /** True when no files are stale, missing, or extra. */
  clean: boolean
}

/**
 * Normalize file content for comparison: convert CRLF to LF and ensure a single
 * trailing newline. This prevents false positives caused by line-ending differences
 * between platforms or editors that strip/add trailing newlines.
 */
function normalizeContent(content: string): string {
  const lf = content.replace(/\r\n/g, '\n')
  return lf.endsWith('\n') ? lf : lf + '\n'
}

/** Classify files from disk against the expected map, returning stale/missing/extra lists. */
async function classifyFiles(
  expected: Map<string, string>,
  diskFiles: string[],
  outputDir: string
): Promise<Pick<DriftReport, 'stale' | 'missing' | 'extra'>> {
  const diskSet = new Set(diskFiles)
  const expectedSet = new Set(expected.keys())

  const stale: DriftReport['stale'] = []
  const missing: DriftReport['missing'] = []
  const extra: DriftReport['extra'] = []

  for (const [filename, expectedContent] of expected) {
    if (!diskSet.has(filename)) {
      missing.push({ filename, reason: 'missing' })
    } else {
      const diskContent = await readFile(join(outputDir, filename), 'utf-8')
      if (normalizeContent(expectedContent) !== normalizeContent(diskContent)) {
        stale.push({ filename, reason: 'stale' })
      }
    }
  }

  for (const filename of diskFiles) {
    if (!expectedSet.has(filename)) {
      extra.push({ filename, reason: 'extra' })
    }
  }

  return { stale, missing, extra }
}

/**
 * Compare in-memory generator output against files on disk.
 *
 * @param expected  Map of filename (basename only, e.g. "models.ts") to formatted file content.
 *                  This must be the already-formatted output (prettier applied) to match the write path.
 * @param outputDir Absolute path to the directory that holds the committed generated files.
 * @returns A DriftReport describing any stale, missing, or extra files.
 */
export async function compareOutput(
  expected: Map<string, string>,
  outputDir: string
): Promise<DriftReport> {
  let diskFiles: string[]

  try {
    const entries = await readdir(outputDir, { withFileTypes: true })
    diskFiles = entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException
    if (nodeErr.code === 'ENOENT') {
      // Output directory does not exist: every expected file is missing, zero extra.
      const missing = Array.from(expected.keys()).map((filename) => ({
        filename,
        reason: 'missing' as const,
      }))
      const total = missing.length
      return { stale: [], missing, extra: [], total, clean: total === 0 }
    }
    if (nodeErr.code === 'ENOTDIR') {
      throw new Error(
        `Output path '${outputDir}' is a file, not a directory. Check the 'output' config option.`
      )
    }
    throw err
  }

  const { stale, missing, extra } = await classifyFiles(expected, diskFiles, outputDir)
  const total = stale.length + missing.length + extra.length
  return { stale, missing, extra, total, clean: total === 0 }
}

/** Build the human-readable diagnostic lines for a failed drift report. */
function buildDiagnosticLines(report: DriftReport, fixCommand: string): string[] {
  const lines: string[] = [
    'Drift check failed: generated output does not match committed files.',
    '',
  ]

  for (const entry of report.stale) {
    lines.push(
      `  STALE   ${entry.filename}  (content differs from what the generator produces today)`
    )
  }
  for (const entry of report.missing) {
    lines.push(`  MISSING ${entry.filename}  (expected by the generator but not found on disk)`)
  }
  for (const entry of report.extra) {
    lines.push(
      `  EXTRA   ${entry.filename}  (on disk but not produced by the generator; delete it or regenerate)`
    )
  }

  lines.push('')
  lines.push(`Fix: ${fixCommand}`)
  return lines
}

/**
 * Emit `::error file=<path>::` GitHub Actions workflow commands for stale and missing files.
 * When outputDir is provided it is prepended to the filename so GitHub can pin the annotation
 * to the file in the PR diff (e.g. `src/api/models.ts` instead of bare `models.ts`).
 */
function emitGithubAnnotations(
  report: DriftReport,
  fixCommand: string,
  outputDir: string | undefined
): void {
  const prefix = outputDir !== undefined && outputDir !== '' ? `${outputDir}/` : ''
  for (const entry of report.stale) {
    console.log(
      `::error file=${prefix}${entry.filename}::Drift detected: ${entry.filename} is stale. Run '${fixCommand}' and commit the result.`
    )
  }
  for (const entry of report.missing) {
    console.log(
      `::error file=${prefix}${entry.filename}::Drift detected: ${entry.filename} is missing. Run '${fixCommand}' and commit the result.`
    )
  }
}

/** Append a markdown summary table to the GITHUB_STEP_SUMMARY file. */
function writeStepSummary(report: DriftReport, fixCommand: string, summaryPath: string): void {
  const summaryLines = ['', '## Drift check failed', '', '| Status | File |', '|--------|------|']

  for (const entry of report.stale) {
    summaryLines.push(`| STALE | \`${entry.filename}\` |`)
  }
  for (const entry of report.missing) {
    summaryLines.push(`| MISSING | \`${entry.filename}\` |`)
  }
  for (const entry of report.extra) {
    summaryLines.push(`| EXTRA | \`${entry.filename}\` |`)
  }
  summaryLines.push('')
  summaryLines.push(`**Fix:** run \`${fixCommand}\` and commit the result.`)
  summaryLines.push('')

  try {
    appendFileSync(summaryPath, summaryLines.join('\n'), 'utf-8')
  } catch (err) {
    console.warn(
      `Warning: could not write to GITHUB_STEP_SUMMARY (${(err as Error).message}). Diagnostics above are still complete.`
    )
  }
}

/**
 * Print per-file diagnostics for a DriftReport and optionally emit GitHub Actions
 * annotations and a step summary panel.
 *
 * When `opts.github` is true, this function emits `::error file=<path>::`
 * workflow commands for each stale or missing file so GitHub renders inline
 * annotations on the PR. It also appends a markdown summary panel to the file
 * at `process.env.GITHUB_STEP_SUMMARY` when that env var is set.
 *
 * @param report      The DriftReport returned by compareOutput().
 * @param opts.github When true, emit GitHub Actions annotations. Set this only when
 *                    process.env.GITHUB_ACTIONS === 'true'.
 * @param opts.fixCommand  The exact shell command consumers should run to fix drift.
 * @param opts.outputDir   The output directory path relative to the repo root. When
 *                         provided, annotation file paths are prefixed so GitHub can
 *                         pin them to the correct file in the PR diff.
 * @returns An object with the appropriate process exit code: 0 when clean, 1 when drifted.
 */
export function reportDrift(
  report: DriftReport,
  opts: { github: boolean; fixCommand: string; outputDir?: string }
): { exitCode: number } {
  if (report.clean) {
    console.log('Drift check passed: all generated files are up to date.')
    return { exitCode: 0 }
  }

  console.error(buildDiagnosticLines(report, opts.fixCommand).join('\n'))

  if (opts.github) {
    emitGithubAnnotations(report, opts.fixCommand, opts.outputDir)
    const summaryPath = process.env['GITHUB_STEP_SUMMARY']
    if (summaryPath !== undefined && summaryPath !== '') {
      writeStepSummary(report, opts.fixCommand, summaryPath)
    }
  }

  return { exitCode: 1 }
}
