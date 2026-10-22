import { readFileSync, writeFileSync } from 'node:fs'
import type { DependencyChange } from './catalog'

export class DependencyError extends Error {}

type DependencyMap = Record<string, string>
type Manifest = Record<string, unknown>

const MAP_KEYS = ['dependencies', 'devDependencies'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readManifest(file: string): Manifest {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isRecord(parsed)) throw new DependencyError(`${file} is not a JSON object`)
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
  const pkg = readManifest(file)
  for (const name of change.remove ?? []) {
    const key = MAP_KEYS.find((candidate) => mapOf(pkg, candidate)?.[name] !== undefined)
    if (key === undefined) {
      throw new DependencyError(
        `${where}: ${name} is missing from ${file} dependencies and devDependencies`,
      )
    }
    delete (pkg[key] as DependencyMap)[name]
  }
  for (const key of MAP_KEYS) {
    const added = change.add?.[key]
    if (added === undefined) continue
    pkg[key] = sortKeys({ ...(mapOf(pkg, key) ?? {}), ...added })
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
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
