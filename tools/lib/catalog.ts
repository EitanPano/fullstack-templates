import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { validateAgainst, type SchemaName } from './schema'

export type TemplateKind = 'server' | 'frontend' | 'worker'

export type CommandName =
  | 'install'
  | 'dev'
  | 'check'
  | 'typecheck'
  | 'lint'
  | 'format'
  | 'test'
  | 'testDb'
  | 'testE2e'
  | 'contract'
  | 'migrate'

export const COMMAND_NAMES: readonly CommandName[] = [
  'install',
  'dev',
  'check',
  'typecheck',
  'lint',
  'format',
  'test',
  'testDb',
  'testE2e',
  'contract',
  'migrate',
]

export const DEFAULT_DIR_BY_KIND: Record<TemplateKind, string> = {
  server: 'backend',
  frontend: 'frontend',
  worker: 'worker',
}

const KINDS = Object.keys(DEFAULT_DIR_BY_KIND) as TemplateKind[]

export interface DependencyChange {
  remove?: string[]
  add?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
}

export interface FlagSpec {
  summary: string
  default: boolean
  onlyPaths?: string[]
  dependencies?: DependencyChange
}

export interface CapabilitySpec {
  providers: string[]
  mode?: 'push' | 'pull'
}

export interface TemplateManifest {
  schemaVersion: 1
  id: string
  kind: TemplateKind
  name: string
  version: string
  summary: string
  runtime: { language: string; platform: string; minVersion?: string }
  tools: Array<{ name: string; min?: string }>
  placeholders: string[]
  commands: Partial<Record<CommandName, string>> & { check: string }
  agents: string
  flags?: Record<string, FlagSpec>
  capabilities?: Record<string, CapabilitySpec>
  dependencies?: { manifest: string; adapter: 'npm' }
  contract?: { produces: string } | { consumes: string }
  http?: { port: number; health: string; ready?: string }
  gitignore?: string[]
  postGenerate?: CommandName[]
  defaultStack?: string
}

export interface StackManifest {
  schemaVersion: 1
  id: string
  summary: string
  packages: Array<{ template: string; dir: string }>
}

export interface CatalogIndex {
  schemaVersion: 1
  templates: Array<{
    id: string
    kind: TemplateKind
    path: string
    version: string
    summary: string
  }>
  stacks: Array<{ id: string; path: string; summary: string }>
}

export interface CasesFile {
  schemaVersion: 1
  cases: Array<{
    name: string
    stack?: string
    flags?: Record<string, boolean>
    capabilities?: Record<string, string>
  }>
}

export interface LoadedTemplate {
  path: string
  dir: string
  manifest: TemplateManifest
  cases: CasesFile
}

export interface LoadedStack {
  path: string
  dir: string
  manifest: StackManifest
}

export interface Catalog {
  root: string
  index: CatalogIndex
  templates: Map<string, LoadedTemplate>
  stacks: Map<string, LoadedStack>
}

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'))
    this.name = 'CatalogError'
  }
}

const EMPTY_CASES: CasesFile = { schemaVersion: 1, cases: [] }

// Reads and schema-checks one YAML file; a failure is recorded and yields undefined.
function readChecked<T>(
  file: string,
  label: string,
  schema: SchemaName,
  problems: string[],
): T | undefined {
  if (!existsSync(file)) {
    problems.push(`${label}: missing`)
    return undefined
  }
  let data: unknown
  try {
    data = parse(readFileSync(file, 'utf8'))
  } catch (error) {
    problems.push(`${label}: invalid YAML (${error instanceof Error ? error.message : 'unknown'})`)
    return undefined
  }
  const errors = validateAgainst(schema, data)
  if (errors.length > 0) {
    for (const message of errors) problems.push(`${label}: ${message}`)
    return undefined
  }
  return data as T
}

function checkTemplateFiles(
  templatePath: string,
  dir: string,
  manifest: TemplateManifest,
  problems: string[],
): void {
  const base = path.join(dir, 'base')
  if (!existsSync(base)) problems.push(`${templatePath}: base/ is missing`)
  if (!existsSync(path.join(dir, 'compose.yaml'))) {
    problems.push(`${templatePath}: compose.yaml is missing`)
  }
  if (!existsSync(path.join(base, manifest.agents))) {
    problems.push(`${templatePath}: agents file base/${manifest.agents} is missing`)
  }
  for (const [name, flag] of Object.entries(manifest.flags ?? {})) {
    for (const only of flag.onlyPaths ?? []) {
      if (!existsSync(path.join(base, only))) {
        problems.push(`${templatePath}: flag "${name}" onlyPath "${only}" does not exist in base/`)
      }
    }
  }
}

function loadTemplates(
  root: string,
  index: CatalogIndex,
  problems: string[],
): Map<string, LoadedTemplate> {
  const templates = new Map<string, LoadedTemplate>()
  for (const entry of index.templates) {
    const dir = path.join(root, entry.path)
    if (!existsSync(dir)) {
      problems.push(`${entry.path}: directory is listed in index.yaml but missing`)
      continue
    }
    const manifest = readChecked<TemplateManifest>(
      path.join(dir, 'template.yaml'),
      `${entry.path}/template.yaml`,
      'template',
      problems,
    )
    if (!manifest) continue
    for (const field of ['id', 'kind', 'version', 'summary'] as const) {
      if (manifest[field] !== entry[field]) {
        problems.push(
          `${entry.path}: ${field} "${manifest[field]}" differs from index.yaml "${entry[field]}"`,
        )
      }
    }
    const cases =
      readChecked<CasesFile>(
        path.join(dir, 'tests', 'cases.yaml'),
        `${entry.path}/tests/cases.yaml`,
        'cases',
        problems,
      ) ?? EMPTY_CASES
    checkTemplateFiles(entry.path, dir, manifest, problems)
    templates.set(entry.path, { path: entry.path, dir, manifest, cases })
  }
  return templates
}

function loadStacks(
  root: string,
  index: CatalogIndex,
  problems: string[],
): Map<string, LoadedStack> {
  const stacks = new Map<string, LoadedStack>()
  for (const entry of index.stacks) {
    const dir = path.join(root, entry.path)
    const manifest = readChecked<StackManifest>(
      path.join(dir, 'stack.yaml'),
      `${entry.path}/stack.yaml`,
      'stack',
      problems,
    )
    if (!manifest) continue
    if (manifest.id !== entry.id) {
      problems.push(`${entry.path}: id "${manifest.id}" differs from index.yaml "${entry.id}"`)
    }
    if (manifest.summary !== entry.summary) {
      problems.push(`${entry.path}: summary differs from index.yaml`)
    }
    stacks.set(entry.id, { path: entry.path, dir, manifest })
  }
  return stacks
}

function checkCrossReferences(
  templates: Map<string, LoadedTemplate>,
  stacks: Map<string, LoadedStack>,
  problems: string[],
): void {
  const kinds = new Set<string>([...templates.values()].map((t) => t.manifest.kind))
  for (const template of templates.values()) {
    const { manifest } = template
    if (manifest.defaultStack && !stacks.has(manifest.defaultStack)) {
      problems.push(`${template.path}: defaultStack "${manifest.defaultStack}" is not a stack`)
    }
    const consumes =
      manifest.contract && 'consumes' in manifest.contract ? manifest.contract.consumes : ''
    const kind = /^<([a-z]+)>/.exec(consumes)?.[1]
    if (kind && !kinds.has(kind)) {
      problems.push(`${template.path}: contract.consumes names no template of kind "${kind}"`)
    }
    const declared = new Set(Object.keys(manifest.flags ?? {}))
    for (const testCase of template.cases.cases) {
      for (const flag of Object.keys(testCase.flags ?? {})) {
        if (!declared.has(flag)) {
          problems.push(`${template.path}: case "${testCase.name}" uses undeclared flag "${flag}"`)
        }
      }
      if (testCase.stack && !stacks.has(testCase.stack)) {
        problems.push(
          `${template.path}: case "${testCase.name}" uses unknown stack "${testCase.stack}"`,
        )
      }
    }
  }
  for (const stack of stacks.values()) {
    const dirs = new Set<string>()
    for (const pkg of stack.manifest.packages) {
      if (!templates.has(pkg.template)) {
        problems.push(`${stack.path}: package template "${pkg.template}" is not a loaded template`)
      }
      if (dirs.has(pkg.dir)) problems.push(`${stack.path}: package dir "${pkg.dir}" is used twice`)
      dirs.add(pkg.dir)
    }
  }
}

function checkSharedFiles(
  root: string,
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  const required = new Set([
    'shared/docker/compose.yaml',
    'shared/editorconfig/.editorconfig',
    'shared/gitignore/base.gitignore',
  ])
  for (const template of templates.values()) {
    for (const eco of template.manifest.gitignore ?? []) {
      required.add(`shared/gitignore/${eco}.gitignore`)
    }
  }
  for (const file of required) {
    if (!existsSync(path.join(root, file))) problems.push(`${file}: missing`)
  }
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory())
}

function checkUnlisted(root: string, index: CatalogIndex, problems: string[]): void {
  const listed = new Set([...index.templates, ...index.stacks].map((e) => e.path))
  const groups: Array<[string, string]> = [
    ...KINDS.map((kind): [string, string] => [kind, 'template.yaml']),
    ['stacks', 'stack.yaml'],
  ]
  for (const [group, file] of groups) {
    for (const name of subdirectories(path.join(root, group))) {
      const rel = `${group}/${name}`
      if (existsSync(path.join(root, group, name, file)) && !listed.has(rel)) {
        problems.push(`${rel}: has a ${file} but is not listed in index.yaml`)
      }
    }
  }
}

export function loadCatalog(root: string): Catalog {
  const problems: string[] = []
  const index = readChecked<CatalogIndex>(
    path.join(root, 'index.yaml'),
    'index.yaml',
    'index',
    problems,
  )
  if (!index) throw new CatalogError(problems)

  const templates = loadTemplates(root, index, problems)
  const stacks = loadStacks(root, index, problems)
  checkCrossReferences(templates, stacks, problems)
  checkSharedFiles(root, templates, problems)
  checkUnlisted(root, index, problems)

  if (problems.length > 0) throw new CatalogError(problems)
  return { root, index, templates, stacks }
}
