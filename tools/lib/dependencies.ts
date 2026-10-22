import { readFileSync, writeFileSync } from 'node:fs'
import type { DependencyChange } from './catalog'

export class DependencyError extends Error {}

type DependencyMap = Record<string, string>
type Manifest = Record<string, unknown>

const MAP_KEYS = ['dependencies', 'devDependencies'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readManifest(file: string, where: string): Manifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new DependencyError(`${where}: cannot read ${file}: ${reason}`)
  }
  if (!isRecord(parsed)) throw new DependencyError(`${where}: ${file} is not a JSON object`)
  return parsed
}

function mapOf(pkg: Manifest, key: string): DependencyMap | undefined {
  const value = pkg[key]
  return isRecord(value) ? (value as DependencyMap) : undefined
}

function sortKeys(map: DependencyMap): DependencyMap {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

function applyNpm(file: string, change: DependencyChange, where: string): void {
  const pkg = readManifest(file, where)
  for (const name of change.remove ?? []) {
    let found = false
    for (const key of MAP_KEYS) {
      const map = mapOf(pkg, key)
      if (map?.[name] === undefined) continue
      delete map[name]
      found = true
    }
    if (!found) {
      throw new DependencyError(
        `${where}: ${name} is missing from ${file} dependencies and devDependencies`,
      )
    }
  }
  for (const key of MAP_KEYS) {
    const added = change.add?.[key]
    if (added === undefined) continue
    pkg[key] = sortKeys({ ...(mapOf(pkg, key) ?? {}), ...added })
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
}

function applyNpmScripts(file: string, scripts: Record<string, string>, where: string): void {
  const pkg = readManifest(file, where)
  const existing = isRecord(pkg.scripts) ? (pkg.scripts as Record<string, string>) : {}
  for (const name of Object.keys(scripts)) {
    if (name in existing) {
      throw new DependencyError(`${where}: script ${name} already exists in ${file}`)
    }
  }
  pkg.scripts = { ...existing, ...scripts }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
}

// The loader refuses a clashing script too; this is the last line before a write.
export function applyScripts(
  manifestPath: string,
  adapter: 'npm',
  scripts: Record<string, string>,
  where: string,
): void {
  switch (adapter) {
    case 'npm':
      applyNpmScripts(manifestPath, scripts, where)
      return
    default:
      throw new DependencyError(`${where}: unknown dependency adapter ${String(adapter)}`)
  }
}

export function applyDependencyChange(
  manifestPath: string,
  adapter: 'npm',
  change: DependencyChange,
  where: string,
): void {
  switch (adapter) {
    case 'npm':
      applyNpm(manifestPath, change, where)
      return
    default:
      throw new DependencyError(`${where}: unknown dependency adapter ${String(adapter)}`)
  }
}
