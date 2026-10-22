import { cpSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import path from 'node:path'

export function listFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...listFiles(full))
    else found.push(full)
  }
  return found
}

export function copyTree(from: string, to: string): void {
  cpSync(from, to, { recursive: true })
}

export function removeTree(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
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
