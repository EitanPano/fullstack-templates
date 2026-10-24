import { existsSync } from 'node:fs'
import path from 'node:path'
import type { CommandName, DeployMode } from './catalog'
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
  // Present only when the plan has a server and a frontend.
  deploy?: DeployMode
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
  providers: Record<string, string>
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
      commands: pkg.commands,
      ...(manifest.http === undefined ? {} : { http: manifest.http }),
    }
  }
  return {
    schemaVersion: 1,
    catalog,
    generatedAt: now.toISOString(),
    stack: plan.stackId,
    ...(plan.deploy === null ? {} : { deploy: plan.deploy }),
    packages,
    providers: Object.fromEntries(plan.providers.map((p) => [p.kind, p.id])),
    answers: { projectName: plan.projectName },
  }
}

// A catalog nested inside some other repository must not report that repository's identity,
// so only a `.git` at the root itself counts (a directory, or a file in a worktree).
function isRepositoryRoot(root: string): boolean {
  return existsSync(path.join(root, '.git'))
}

// The root is the working directory, not a `-C` argument: commandOutput splits on whitespace.
function gitLines(root: string, args: string): string[] {
  try {
    return commandOutput(`git ${args}`, root)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  } catch {
    return []
  }
}

const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)$/

function highestVersionTag(tags: string[]): string | null {
  const key = (tag: string) => (SEMVER_TAG.exec(tag) ?? []).slice(1).map(Number)
  const versions = tags.filter((tag) => SEMVER_TAG.test(tag))
  versions.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return (kb[i] ?? 0) - (ka[i] ?? 0)
    return 0
  })
  return versions[0] ?? null
}

// A remote recorded in provenance is committed to the project; credentials must not travel with it.
function withoutCredentials(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1')
}

// commandOutput lets git's stderr through, so each query is one that exits quietly: git is never
// run outside a repository root, `tag --points-at` prints nothing instead of failing like
// `describe --exact-match`, and `rev-parse --verify -q` is silent in a repository with no commit.
export function catalogIdentity(root: string, version?: string): CatalogIdentity {
  if (!isRepositoryRoot(root)) {
    return { repository: 'local', version: version ?? 'unversioned', commit: null }
  }
  const remote = gitLines(root, 'config --get remote.origin.url')[0]
  return {
    repository: remote === undefined ? 'local' : withoutCredentials(remote),
    version: version ?? highestVersionTag(gitLines(root, 'tag --points-at HEAD')) ?? 'unversioned',
    commit: gitLines(root, 'rev-parse --verify -q HEAD')[0] ?? null,
  }
}
