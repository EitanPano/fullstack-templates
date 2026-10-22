import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CommandName } from './catalog'
import { commandOutput } from './commands'
import type { GenerationPlan } from './plan'

export const PROVENANCE_PATH = '.fullstack/catalog.yaml'

export interface CatalogIdentity {
  repository: string
  version: string
  commit: string | null
}

export interface Provenance {
  schemaVersion: 1
  catalog: CatalogIdentity
  generatedAt: string
  stack: string | null
  packages: Record<
    string,
    {
      template: string
      version: string
      flags: Record<string, boolean>
      capabilities: Record<string, string>
      commands: Partial<Record<CommandName, string>>
      http?: { port: number; health: string; ready?: string }
    }
  >
  providers: Record<string, never>
  answers: { projectName: string }
}

export function buildProvenance(
  plan: GenerationPlan,
  catalog: CatalogIdentity,
  now: Date,
): Provenance {
  const packages: Provenance['packages'] = {}
  for (const pkg of plan.packages) {
    const { manifest, path } = pkg.template
    packages[pkg.dir] = {
      template: path,
      version: manifest.version,
      flags: pkg.flags,
      capabilities: pkg.capabilities,
      commands: manifest.commands,
      ...(manifest.http === undefined ? {} : { http: manifest.http }),
    }
  }
  return {
    schemaVersion: 1,
    catalog,
    generatedAt: now.toISOString(),
    stack: plan.stackId,
    packages,
    providers: {},
    answers: { projectName: plan.projectName },
  }
}

function insideRepository(root: string): boolean {
  for (let dir = path.resolve(root); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, '.git'))) return true
    if (path.dirname(dir) === dir) return false
  }
}

// The root is the working directory, not a `-C` argument: commandOutput splits on whitespace.
function gitOutput(root: string, args: string): string | null {
  try {
    const out = commandOutput(`git ${args}`, root)
    return out === '' ? null : (out.split('\n')[0]?.trim() ?? null)
  } catch {
    return null
  }
}

// commandOutput lets git's stderr through, so each query is one that exits quietly: outside a
// repository git is never run, `tag --points-at` prints nothing instead of failing like
// `describe --exact-match`, and `rev-parse --verify -q` is silent in a repository with no commit.
export function catalogIdentity(root: string, version?: string): CatalogIdentity {
  if (!insideRepository(root))
    return { repository: 'local', version: version ?? 'unversioned', commit: null }
  return {
    repository: gitOutput(root, 'config --get remote.origin.url') ?? 'local',
    version: version ?? gitOutput(root, 'tag --points-at HEAD') ?? 'unversioned',
    commit: gitOutput(root, 'rev-parse --verify -q HEAD'),
  }
}
