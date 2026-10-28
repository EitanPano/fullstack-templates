import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  checkCapabilityCases,
  checkProvidersUsed,
  checkUnlistedCapabilities,
  loadOverlays,
  loadProviders,
} from './capabilities'
import type { BrandInput } from './brand'
import { CAPABILITY_KINDS, isKind, type CapabilityKind } from './capability-kinds'
import { readChecked, subdirectories } from './read-checked'

export type DeployMode = 'single' | 'split'

export const DEPLOY_MODES: readonly DeployMode[] = ['single', 'split']

export type TemplateKind = 'server' | 'frontend' | 'worker'

export type CommandName =
  | 'install'
  | 'dev'
  | 'check'
  | 'typecheck'
  | 'lint'
  | 'format'
  | 'test'
  | 'start'
  | 'testDb'
  | 'testE2e'
  | 'e2eDb'
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
  'start',
  'testDb',
  'testE2e',
  'e2eDb',
  'contract',
  'migrate',
]

export const DEFAULT_DIR_BY_KIND: Record<TemplateKind, string> = {
  server: 'backend',
  frontend: 'frontend',
  worker: 'worker',
}

const KINDS = Object.keys(DEFAULT_DIR_BY_KIND) as TemplateKind[]

// A frontend sees the server package's flags and capability kinds as `server:<name>`.
export const SERVER_PREFIX = 'server:'

// Every name any server template of the catalog declares, so a marker in a frontend resolves
// whichever server the stack brings (and is off for the ones it does not).
export function serverSelectionNames(templates: Iterable<LoadedTemplate>): string[] {
  const names = new Set<string>()
  for (const { manifest } of templates) {
    if (manifest.kind !== 'server') continue
    for (const flag of Object.keys(manifest.flags ?? {})) names.add(flag)
    for (const kind of Object.keys(manifest.capabilities ?? {})) names.add(kind)
  }
  return [...names].sort()
}

export interface DependencyChange {
  remove?: string[]
  add?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
}

export type DependencyAdapter = 'npm' | 'pyproject'

export interface FlagSpec {
  summary: string
  default: boolean
  onlyPaths?: string[]
  dependencies?: DependencyChange
}

export { CAPABILITY_KINDS, type CapabilityKind }

export interface CapabilitySpec {
  providers: string[]
  mode?: 'push' | 'pull'
}

export interface ProviderEnv {
  name: string
  summary: string
  local: string
  compose: string
  test: string
  testOverride?: string
  // The browser-test database (e2eDb, testE2e) and the variable that overrides it.
  e2e?: string
  e2eOverride?: string
  secret?: boolean
}

export interface ProviderManifest {
  schemaVersion: 1
  kind: CapabilityKind
  id: string
  name: string
  service: string
  compose: string
  env: ProviderEnv[]
  files?: string[]
}

export interface CapabilityManifest {
  schemaVersion: 1
  kind: CapabilityKind
  provider: string
  summary: string
  dependencies?: DependencyChange
  scripts?: Record<string, string>
  flags?: Record<string, { onlyPaths: string[] }>
  commands?: Partial<Record<CommandName, string>>
  // What the generated container runs; read by later tasks, only its shape is checked here.
  container?: { migrate: string }
  // Base file the overlay replaces (relative to base/) to the blob id it was reconciled against.
  pins?: Record<string, string>
}

export interface TemplateManifest {
  schemaVersion: 1
  id: string
  kind: TemplateKind
  name: string
  version: string
  summary: string
  runtime: { language: string; platform: string; minVersion?: string }
  // `min` is inclusive, `max` exclusive: the first version the tool is NOT supported at.
  tools: Array<{ name: string; min?: string; max?: string }>
  placeholders: string[]
  commands: Partial<Record<CommandName, string>> & { check: string }
  agents: string
  flags?: Record<string, FlagSpec>
  capabilities?: Partial<Record<CapabilityKind, CapabilitySpec>>
  dependencies?: { manifest: string; adapter: DependencyAdapter }
  contract?: { produces: string } | { consumes: string }
  http?: { port: number; health: string; ready?: string }
  gitignore?: string[]
  postGenerate?: CommandName[]
  dropAfterPostGenerate?: string[]
  // Frontend only: files kept only while a `server:<name>` selection is on, as a flag's onlyPaths
  // are kept only while the flag is.
  onlyWhen?: Record<string, string[]>
  defaultStack?: string
  // Frontend only: the directory the build writes, which the server serves in the single mode.
  static?: { out: string }
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
    // The case also runs the Compose smoke under test-generated --with-app.
    withApp?: boolean
    // The deploy mode the case generates with; the Compose smoke of T2 reads it.
    deploy?: DeployMode
    // A frontend case only: the brand inputs, as answers.brand takes them.
    brand?: BrandInput
    // A frontend case only: the flags and capabilities of the stack's server package.
    server?: { flags?: Record<string, boolean>; capabilities?: Record<string, string> }
  }>
}

export interface LoadedTemplate {
  path: string
  dir: string
  manifest: TemplateManifest
  cases: CasesFile
  // Keyed `${kind}/${provider}`.
  overlays: Map<string, LoadedOverlay>
}

export interface LoadedStack {
  path: string
  dir: string
  manifest: StackManifest
}

export interface LoadedProvider {
  kind: CapabilityKind
  id: string
  dir: string
  manifest: ProviderManifest
}

export interface LoadedOverlay {
  kind: CapabilityKind
  provider: string
  dir: string
  overlayDir: string
  manifest: CapabilityManifest
}

export interface Catalog {
  root: string
  index: CatalogIndex
  templates: Map<string, LoadedTemplate>
  // Keyed `${kind}/${id}`.
  providers: Map<string, LoadedProvider>
  stacks: Map<string, LoadedStack>
}

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('\n'))
    this.name = 'CatalogError'
  }
}

const EMPTY_CASES: CasesFile = { schemaVersion: 1, cases: [] }

// The harness's own rules cite these sections of a server package's agents file.
export const SERVER_AGENTS_HEADINGS = [
  'Adding a module',
  'Adding the data layer',
  'Errors',
  'Tests',
  'Deployment',
] as const

// The layer map is part of the frontend contract but is not a checked heading (ADR 0003, M5-9).
export const FRONTEND_AGENTS_HEADINGS = [
  'Adding a feature',
  'Styling',
  'Errors',
  'Tests',
  'Deployment',
] as const

// A fenced block may hold a shell comment that looks like a heading; only a fence of the same
// character, at least as long, closes it (CommonMark).
function missingHeadings(agentsFile: string, required: readonly string[]): string[] {
  const found = new Set<string>()
  let fence: { char: string; length: number } | null = null
  for (const line of readFileSync(agentsFile, 'utf8').split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence === null) {
      if (marker !== undefined) {
        fence = { char: marker.charAt(0), length: marker.length }
        continue
      }
    } else {
      if (marker?.charAt(0) === fence.char && marker.length >= fence.length) fence = null
      continue
    }
    // An ATX heading may close with hashes, as in "## Errors ##".
    const match = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line)
    if (match?.[1] !== undefined) found.add(match[1])
  }
  return required.filter((heading) => !found.has(heading))
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
  const agentsFile = path.join(base, manifest.agents)
  const required =
    manifest.kind === 'server'
      ? SERVER_AGENTS_HEADINGS
      : manifest.kind === 'frontend'
        ? FRONTEND_AGENTS_HEADINGS
        : undefined
  if (required !== undefined && existsSync(agentsFile)) {
    const missing = missingHeadings(agentsFile, required)
    if (missing.length > 0) {
      const names = missing.map((heading) => `"${heading}"`).join(', ')
      problems.push(
        `${templatePath}: agents file base/${manifest.agents} lacks the headings ${names}`,
      )
    }
  }
  if (manifest.static !== undefined && manifest.kind !== 'frontend') {
    problems.push(
      `${templatePath}: static is only for frontend templates, this one is a ${manifest.kind}`,
    )
  }
  // A "." segment names the package itself or a path that a drop would resolve oddly; refusing it
  // here names the template before any generation runs.
  for (const entry of manifest.dropAfterPostGenerate ?? []) {
    if (entry.split('/').includes('.')) {
      problems.push(
        `${templatePath}/template.yaml: dropAfterPostGenerate entry "${entry}" must not have a "." segment`,
      )
    }
  }
  for (const [name, paths] of Object.entries(manifest.onlyWhen ?? {})) {
    if (manifest.kind === 'server') {
      problems.push(`${templatePath}: onlyWhen is not for a server template, which has no ${name}`)
    }
    for (const only of paths) {
      if (!existsSync(path.join(base, only))) {
        problems.push(`${templatePath}: onlyWhen "${name}" path "${only}" does not exist in base/`)
      }
    }
  }
  for (const [name, flag] of Object.entries(manifest.flags ?? {})) {
    if (manifest.dependencies?.adapter === 'pyproject' && flag.dependencies !== undefined) {
      problems.push(
        `${templatePath}: flag "${name}" dependencies are not allowed with the pyproject adapter: use markers in pyproject.toml`,
      )
    }
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
  providers: Map<string, LoadedProvider>,
  problems: string[],
): Map<string, LoadedTemplate> {
  const templates = new Map<string, LoadedTemplate>()
  for (const entry of index.templates) {
    if (entry.path !== `${entry.kind}/${entry.id}`) {
      problems.push(`${entry.path}: path must be ${entry.kind}/${entry.id}`)
      continue
    }
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
    const loaded: LoadedTemplate = {
      path: entry.path,
      dir,
      manifest,
      cases,
      overlays: new Map(),
    }
    loaded.overlays = loadOverlays(loaded, providers, problems)
    checkUnlistedCapabilities(loaded, problems)
    templates.set(entry.path, loaded)
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
    if (entry.path !== `stacks/${entry.id}`) {
      problems.push(`${entry.path}: path must be stacks/${entry.id}`)
      continue
    }
    const dir = path.join(root, entry.path)
    if (!existsSync(dir)) {
      problems.push(`${entry.path}: directory is listed in index.yaml but missing`)
      continue
    }
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

// Every template must be generated at least with its defaults and once per flag flipped away from
// its default, so no flag path ships untested.
function checkCaseCoverage(template: LoadedTemplate, problems: string[]): void {
  const { cases } = template.cases
  if (!cases.some((testCase) => testCase.name === 'default')) {
    problems.push(`${template.path}: tests/cases.yaml has no case named "default"`)
  }
  // The default-brand cases cannot catch a brand value that breaks a gate (v1.4.0 shipped three).
  if (template.manifest.kind === 'frontend' && !cases.some((c) => c.brand !== undefined)) {
    problems.push(
      `${template.path}: no case sets a brand; add one with non-default brand values in tests/cases.yaml`,
    )
  }
  for (const [name, spec] of Object.entries(template.manifest.flags ?? {})) {
    if (!cases.some((testCase) => testCase.flags?.[name] === !spec.default)) {
      problems.push(
        `${template.path}: no case sets flag "${name}" to ${String(!spec.default)}, its non-default value`,
      )
    }
  }
}

// An onlyWhen key must be `server:<name>` for a flag or capability kind some server declares.
function checkOnlyWhenNames(
  template: LoadedTemplate,
  serverNames: readonly string[],
  problems: string[],
): void {
  for (const name of Object.keys(template.manifest.onlyWhen ?? {})) {
    if (
      !name.startsWith(SERVER_PREFIX) ||
      !serverNames.includes(name.slice(SERVER_PREFIX.length))
    ) {
      problems.push(
        `${template.path}: onlyWhen "${name}" is not a server selection; use server:<flag or capability kind> of a server template (${serverNames.map((n) => SERVER_PREFIX + n).join(', ')})`,
      )
    }
  }
}

// A frontend case may set the flags and capabilities of its stack's server package; the server
// template must declare them, as a server case's own must.
function checkServerSettings(
  template: LoadedTemplate,
  testCase: CasesFile['cases'][number],
  stacks: Map<string, LoadedStack>,
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  if (testCase.server === undefined) return
  const where = `${template.path}: case "${testCase.name}"`
  if (template.manifest.kind === 'server') {
    problems.push(`${where} has server settings, which only a frontend case takes`)
    return
  }
  const stack = testCase.stack === undefined ? undefined : stacks.get(testCase.stack)
  if (testCase.stack === undefined) {
    problems.push(`${where} has server settings but names no stack`)
    return
  }
  const entry = stack?.manifest.packages.find(
    (pkg) => templates.get(pkg.template)?.manifest.kind === 'server',
  )
  const server = entry === undefined ? undefined : templates.get(entry.template)
  if (server === undefined) {
    if (stack !== undefined)
      problems.push(`${where} has server settings, but its stack has no server`)
    return
  }
  for (const flag of Object.keys(testCase.server.flags ?? {})) {
    if (server.manifest.flags?.[flag] === undefined) {
      problems.push(`${where} sets server flag "${flag}", which ${server.path} does not declare`)
    }
  }
  for (const [kind, provider] of Object.entries(testCase.server.capabilities ?? {})) {
    const spec = isKind(kind) ? server.manifest.capabilities?.[kind] : undefined
    if (spec === undefined) {
      problems.push(
        `${where} sets server capability "${kind}", which ${server.path} does not declare`,
      )
    } else if (!spec.providers.includes(provider)) {
      problems.push(
        `${where} sets server capability ${kind} to unlisted provider "${provider}" of ${server.path}`,
      )
    }
  }
}

function checkCrossReferences(
  templates: Map<string, LoadedTemplate>,
  stacks: Map<string, LoadedStack>,
  problems: string[],
): void {
  const serverNames = serverSelectionNames(templates.values())
  for (const template of templates.values()) {
    const { manifest } = template
    if (manifest.defaultStack && !stacks.has(manifest.defaultStack)) {
      problems.push(`${template.path}: defaultStack "${manifest.defaultStack}" is not a stack`)
    }
    const consumes =
      manifest.contract && 'consumes' in manifest.contract ? manifest.contract.consumes : ''
    if (consumes) {
      const kind = /^<(server|frontend|worker)>\/.+$/.exec(consumes)?.[1]
      const stack = manifest.defaultStack ? stacks.get(manifest.defaultStack) : undefined
      if (!kind) {
        problems.push(
          `${template.path}: contract.consumes "${consumes}" must have the form <kind>/<path>`,
        )
      } else if (
        stack &&
        !stack.manifest.packages.some((pkg) => templates.get(pkg.template)?.manifest.kind === kind)
      ) {
        problems.push(
          `${template.path}: contract.consumes names kind "${kind}" but defaultStack "${stack.manifest.id}" has no such package`,
        )
      }
    }
    const declared = new Set(Object.keys(manifest.flags ?? {}))
    checkOnlyWhenNames(template, serverNames, problems)
    checkCaseCoverage(template, problems)
    checkCapabilityCases(template, problems)
    for (const testCase of template.cases.cases) {
      if (testCase.brand !== undefined && manifest.kind === 'server') {
        problems.push(
          `${template.path}: case "${testCase.name}" has a brand, which only a frontend case takes`,
        )
      }
      checkServerSettings(template, testCase, stacks, templates, problems)
      for (const flag of Object.keys(testCase.flags ?? {})) {
        if (!declared.has(flag)) {
          problems.push(`${template.path}: case "${testCase.name}" uses undeclared flag "${flag}"`)
        }
      }
      if (testCase.stack) {
        const stack = stacks.get(testCase.stack)
        if (!stack) {
          problems.push(
            `${template.path}: case "${testCase.name}" uses unknown stack "${testCase.stack}"`,
          )
        } else if (!stack.manifest.packages.some((pkg) => pkg.template === template.path)) {
          problems.push(
            `${template.path}: case "${testCase.name}" uses stack "${testCase.stack}", which has no package for this template`,
          )
        }
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

  const providers = loadProviders(root, problems)
  const templates = loadTemplates(root, index, providers, problems)
  const stacks = loadStacks(root, index, problems)
  checkCrossReferences(templates, stacks, problems)
  checkProvidersUsed(providers, templates, problems)
  checkSharedFiles(root, templates, problems)
  checkUnlisted(root, index, problems)

  if (problems.length > 0) throw new CatalogError(problems)
  return { root, index, templates, providers, stacks }
}
