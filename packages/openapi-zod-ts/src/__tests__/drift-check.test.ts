import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Dirent } from 'node:fs'

// Mock node:fs/promises so we can control the file system in tests.
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}))

// Mock node:fs (appendFileSync used for GITHUB_STEP_SUMMARY).
vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
}))

import { compareOutput, reportDrift, type DriftReport } from '../drift-check.js'
import * as fsPromises from 'node:fs/promises'
import * as fs from 'node:fs'

const mockReaddir = vi.mocked(fsPromises.readdir)
const mockReadFile = vi.mocked(fsPromises.readFile)
const mockAppendFileSync = vi.mocked(fs.appendFileSync)

/** Build a minimal Dirent-like object for use in readdir mocks. */
function fakeDirent(name: string): Dirent {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: '',
    path: '',
  } as unknown as Dirent
}

const OUTPUT_DIR = '/project/src/api'

beforeEach(() => {
  vi.resetAllMocks()
  // Clear GITHUB_STEP_SUMMARY between tests.
  delete process.env['GITHUB_STEP_SUMMARY']
  delete process.env['GITHUB_ACTIONS']
})

afterEach(() => {
  delete process.env['GITHUB_STEP_SUMMARY']
  delete process.env['GITHUB_ACTIONS']
})

// ---------------------------------------------------------------------------
// compareOutput
// ---------------------------------------------------------------------------

describe('compareOutput', () => {
  it('returns a clean DriftReport when expected Map matches disk exactly', async () => {
    const expected = new Map([
      ['models.ts', 'export type Foo = string;\n'],
      ['client.ts', 'export function getAll() {}\n'],
    ])

    mockReaddir.mockResolvedValue([fakeDirent('models.ts'), fakeDirent('client.ts')])
    mockReadFile
      .mockResolvedValueOnce('export type Foo = string;\n')
      .mockResolvedValueOnce('export function getAll() {}\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(true)
    expect(report.total).toBe(0)
    expect(report.stale).toHaveLength(0)
    expect(report.missing).toHaveLength(0)
    expect(report.extra).toHaveLength(0)
  })

  it('reports stale for a file whose content differs on disk', async () => {
    const expected = new Map([['models.ts', 'export type Foo = string;\n']])

    mockReaddir.mockResolvedValue([fakeDirent('models.ts')])
    // Disk has old content.
    mockReadFile.mockResolvedValue('export type Foo = number;\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(false)
    expect(report.stale).toHaveLength(1)
    expect(report.stale[0]).toEqual({ filename: 'models.ts', reason: 'stale' })
    expect(report.missing).toHaveLength(0)
    expect(report.extra).toHaveLength(0)
    expect(report.total).toBe(1)
  })

  it('reports missing for a file in expected but absent from disk', async () => {
    const expected = new Map([
      ['models.ts', 'export type Foo = string;\n'],
      ['client.ts', 'export function getAll() {}\n'],
    ])

    // Only models.ts is on disk.
    mockReaddir.mockResolvedValue([fakeDirent('models.ts')])
    mockReadFile.mockResolvedValue('export type Foo = string;\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(false)
    expect(report.missing).toHaveLength(1)
    expect(report.missing[0]).toEqual({ filename: 'client.ts', reason: 'missing' })
    expect(report.stale).toHaveLength(0)
    expect(report.extra).toHaveLength(0)
  })

  it('reports extra for a file on disk not in expected', async () => {
    const expected = new Map([['models.ts', 'export type Foo = string;\n']])

    // Disk has an extra stale artifact.
    mockReaddir.mockResolvedValue([fakeDirent('models.ts'), fakeDirent('old-client.ts')])
    mockReadFile.mockResolvedValue('export type Foo = string;\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(false)
    expect(report.extra).toHaveLength(1)
    expect(report.extra[0]).toEqual({ filename: 'old-client.ts', reason: 'extra' })
    expect(report.stale).toHaveLength(0)
    expect(report.missing).toHaveLength(0)
  })

  it('normalizes CRLF to LF before comparison so identical content does not false-positive', async () => {
    // Expected has LF; disk has CRLF. Should match.
    const expected = new Map([['models.ts', 'export type Foo = string;\n']])

    mockReaddir.mockResolvedValue([fakeDirent('models.ts')])
    mockReadFile.mockResolvedValue('export type Foo = string;\r\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(true)
    expect(report.stale).toHaveLength(0)
  })

  it('normalizes missing trailing newline before comparison so it does not false-positive', async () => {
    // Expected has trailing newline; disk does not. Should match after normalization.
    const expected = new Map([['models.ts', 'export type Foo = string;\n']])

    mockReaddir.mockResolvedValue([fakeDirent('models.ts')])
    mockReadFile.mockResolvedValue('export type Foo = string;')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(true)
  })

  it('returns all-missing report when outputDir does not exist', async () => {
    const expected = new Map([
      ['models.ts', 'export type Foo = string;\n'],
      ['client.ts', 'export function getAll() {}\n'],
    ])

    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReaddir.mockRejectedValue(enoent)

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.clean).toBe(false)
    expect(report.missing).toHaveLength(2)
    expect(report.stale).toHaveLength(0)
    expect(report.extra).toHaveLength(0)
    expect(report.total).toBe(2)
  })

  it('handles multiple stale, missing, and extra files in one call', async () => {
    const expected = new Map([
      ['models.ts', 'new content\n'],
      ['client.ts', 'client content\n'],
      ['index.ts', 'index content\n'],
    ])

    // Disk: models.ts (stale), client.ts (missing), bonus.ts (extra)
    mockReaddir.mockResolvedValue([fakeDirent('models.ts'), fakeDirent('bonus.ts')])
    // Only one readFile call: for models.ts (client.ts is missing, bonus.ts is extra but not read).
    mockReadFile.mockResolvedValue('old content\n')

    const report = await compareOutput(expected, OUTPUT_DIR)

    expect(report.stale).toHaveLength(1)
    expect(report.stale[0]!.filename).toBe('models.ts')
    expect(report.missing).toHaveLength(2)
    const missingNames = report.missing.map((m) => m.filename)
    expect(missingNames).toContain('client.ts')
    expect(missingNames).toContain('index.ts')
    expect(report.extra).toHaveLength(1)
    expect(report.extra[0]!.filename).toBe('bonus.ts')
    expect(report.total).toBe(4)
    expect(report.clean).toBe(false)
  })

  it('re-throws non-ENOENT errors from readdir', async () => {
    const expected = new Map([['models.ts', 'content\n']])
    const permErr = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockReaddir.mockRejectedValue(permErr)

    await expect(compareOutput(expected, OUTPUT_DIR)).rejects.toThrow('EACCES')
  })

  it('throws a clear actionable error when outputDir is a file (ENOTDIR)', async () => {
    const expected = new Map([['models.ts', 'content\n']])
    const enotdir = Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' })
    mockReaddir.mockRejectedValue(enotdir)

    await expect(compareOutput(expected, OUTPUT_DIR)).rejects.toThrow(
      `Output path '${OUTPUT_DIR}' is a file, not a directory`
    )
  })
})

// ---------------------------------------------------------------------------
// reportDrift
// ---------------------------------------------------------------------------

const FIX_COMMAND = 'openapi-zod-ts'

function cleanReport(): DriftReport {
  return { stale: [], missing: [], extra: [], total: 0, clean: true }
}

function staleReport(): DriftReport {
  return {
    stale: [{ filename: 'models.ts', reason: 'stale' }],
    missing: [],
    extra: [],
    total: 1,
    clean: false,
  }
}

function missingReport(): DriftReport {
  return {
    stale: [],
    missing: [{ filename: 'client.ts', reason: 'missing' }],
    extra: [],
    total: 1,
    clean: false,
  }
}

function extraReport(): DriftReport {
  return {
    stale: [],
    missing: [],
    extra: [{ filename: 'old-endpoint.ts', reason: 'extra' }],
    total: 1,
    clean: false,
  }
}

describe('reportDrift', () => {
  it('returns exitCode 0 for a clean report', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const { exitCode } = reportDrift(cleanReport(), { github: false, fixCommand: FIX_COMMAND })
    expect(exitCode).toBe(0)
    consoleSpy.mockRestore()
  })

  it('returns exitCode 1 for a report with stale files', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { exitCode } = reportDrift(staleReport(), { github: false, fixCommand: FIX_COMMAND })
    expect(exitCode).toBe(1)
    errSpy.mockRestore()
  })

  it('returns exitCode 1 for a report with missing files', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { exitCode } = reportDrift(missingReport(), { github: false, fixCommand: FIX_COMMAND })
    expect(exitCode).toBe(1)
    errSpy.mockRestore()
  })

  it('returns exitCode 1 for a report with extra files', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { exitCode } = reportDrift(extraReport(), { github: false, fixCommand: FIX_COMMAND })
    expect(exitCode).toBe(1)
    errSpy.mockRestore()
  })

  it('prints per-file diagnostic lines for each stale entry', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reportDrift(staleReport(), { github: false, fixCommand: FIX_COMMAND })
    const output: string = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(output).toContain('STALE')
    expect(output).toContain('models.ts')
    errSpy.mockRestore()
  })

  it('prints per-file diagnostic lines for each missing entry', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reportDrift(missingReport(), { github: false, fixCommand: FIX_COMMAND })
    const output: string = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(output).toContain('MISSING')
    expect(output).toContain('client.ts')
    errSpy.mockRestore()
  })

  it('prints per-file diagnostic lines for each extra entry', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reportDrift(extraReport(), { github: false, fixCommand: FIX_COMMAND })
    const output: string = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(output).toContain('EXTRA')
    expect(output).toContain('old-endpoint.ts')
    errSpy.mockRestore()
  })

  it('prints the fix command in the diagnostic output', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reportDrift(staleReport(), { github: false, fixCommand: 'openapi-zod-ts --config my.json' })
    const output: string = errSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(output).toContain('openapi-zod-ts --config my.json')
    errSpy.mockRestore()
  })

  it('emits ::error file=<filename>:: annotation when github=true for stale files (no outputDir)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(staleReport(), { github: true, fixCommand: FIX_COMMAND })

    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logOutput).toContain('::error file=models.ts::')

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('emits ::error file=<filename>:: annotation when github=true for missing files (no outputDir)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(missingReport(), { github: true, fixCommand: FIX_COMMAND })

    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logOutput).toContain('::error file=client.ts::')

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('prefixes annotation file path with outputDir when provided', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(staleReport(), {
      github: true,
      fixCommand: FIX_COMMAND,
      outputDir: 'src/api',
    })

    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logOutput).toContain('::error file=src/api/models.ts::')
    // Ensure the bare filename form is NOT used when outputDir is provided.
    expect(logOutput).not.toContain('::error file=models.ts::')

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('does NOT emit ::error annotations when github=false even if GITHUB_ACTIONS is set', () => {
    process.env['GITHUB_ACTIONS'] = 'true'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(staleReport(), { github: false, fixCommand: FIX_COMMAND })

    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logOutput).not.toContain('::error')

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('writes GITHUB_STEP_SUMMARY markdown panel when github=true and env var is set', () => {
    process.env['GITHUB_STEP_SUMMARY'] = '/tmp/step-summary.md'
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(staleReport(), { github: true, fixCommand: FIX_COMMAND })

    expect(mockAppendFileSync).toHaveBeenCalledOnce()
    const [path, content] = mockAppendFileSync.mock.calls[0]!
    expect(path).toBe('/tmp/step-summary.md')
    expect(String(content)).toContain('Drift check failed')
    expect(String(content)).toContain('models.ts')
    expect(String(content)).toContain(FIX_COMMAND)

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('does not write GITHUB_STEP_SUMMARY when github=true but env var is not set', () => {
    // GITHUB_STEP_SUMMARY is not set (cleared in beforeEach).
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    reportDrift(staleReport(), { github: true, fixCommand: FIX_COMMAND })

    expect(mockAppendFileSync).not.toHaveBeenCalled()

    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  it('warns to stderr when GITHUB_STEP_SUMMARY write fails but does not change exit code', () => {
    process.env['GITHUB_STEP_SUMMARY'] = '/unwritable/path.md'
    mockAppendFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { exitCode } = reportDrift(staleReport(), { github: true, fixCommand: FIX_COMMAND })

    expect(exitCode).toBe(1)
    const warnOutput = warnSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(warnOutput).toContain('GITHUB_STEP_SUMMARY')

    logSpy.mockRestore()
    errSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('logs success message to console.log for a clean report', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    reportDrift(cleanReport(), { github: false, fixCommand: FIX_COMMAND })

    const logOutput = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(logOutput).toContain('passed')

    logSpy.mockRestore()
  })
})
