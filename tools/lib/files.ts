import { cpSync, readdirSync, rmSync, rmdirSync, statSync } from 'node:fs'
import path from 'node:path'

// Walks with the same predicate copyTree uses, so validation, the dry-run and copying see one tree.
export function listFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isExcluded(entry.name, entry.isDirectory())) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listFiles(full))
    else found.push(full)
  }
  return found
}

// A contributor's local state (installs, build output, env files, editor droppings) must never
// reach a generated project: it would break determinism (D6) and can leak secrets.
export const COPY_EXCLUDES = {
  directories: [
    'node_modules',
    '.git',
    '.next',
    'dist',
    'coverage',
    'test-results',
    'playwright-report',
    '.venv',
    '__pycache__',
    '.mypy_cache',
    '.ruff_cache',
    '.pytest_cache',
    '.import_linter_cache',
  ],
  directorySuffixes: ['.egg-info'],
  files: ['next-env.d.ts', '.DS_Store', 'Thumbs.db'],
  suffixes: ['.tsbuildinfo'],
  envPrefix: '.env',
  envKept: '.env.example',
} as const

export function isExcluded(name: string, isDirectory: boolean): boolean {
  if (isDirectory) {
    return (
      (COPY_EXCLUDES.directories as readonly string[]).includes(name) ||
      COPY_EXCLUDES.directorySuffixes.some((suffix) => name.endsWith(suffix))
    )
  }
  if ((COPY_EXCLUDES.files as readonly string[]).includes(name)) return true
  if (COPY_EXCLUDES.suffixes.some((suffix) => name.endsWith(suffix))) return true
  return name.startsWith(COPY_EXCLUDES.envPrefix) && name !== COPY_EXCLUDES.envKept
}

export function copyTree(from: string, to: string): void {
  cpSync(from, to, {
    recursive: true,
    filter: (source) => {
      if (path.resolve(source) === path.resolve(from)) return true
      return !isExcluded(path.basename(source), statSync(source).isDirectory())
    },
  })
}

export function removeTree(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

export const RETRY_ATTEMPTS = 5
export const RETRY_DELAY_MS = 100
const TRANSIENT_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

// On Windows a file operation right after post-generate commands ran can fail with EPERM, EBUSY or
// EACCES (a lingering handle or an antivirus scan); the same call succeeds shortly after. Any other
// error, or the last attempt's, is thrown.
export function retryTransient(operation: () => void, sleep: (ms: number) => void): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      operation()
      return
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code
      if (attempt >= RETRY_ATTEMPTS || typeof code !== 'string' || !TRANSIENT_CODES.has(code)) {
        throw error
      }
      sleep(RETRY_DELAY_MS * attempt)
    }
  }
}

// Removing a flag's only-paths can leave empty directories; stop at the floor or the first non-empty one.
export function pruneEmptyParents(start: string, floor: string): void {
  const stop = path.resolve(floor)
  let current = path.resolve(start)
  while (current !== stop && current.startsWith(stop + path.sep)) {
    if (readdirSync(current).length > 0) return
    rmdirSync(current)
    current = path.dirname(current)
  }
}
