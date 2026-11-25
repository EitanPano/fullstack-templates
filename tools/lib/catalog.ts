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
import { isApiKind, memberProblems, shipsImage } from './package-dir'
import { readChecked, subdirectories } from './read-checked'

export type DeployMode = 'single' | 'split'

export const DEPLOY_MODES: readonly DeployMode[] = ['single', 'split']

export type TemplateKind = 'server' | 'serverless' | 'frontend' | 'sdk' | 'worker'

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

const DEFAULT_DIR_BY_KIND: Record<Exclude<TemplateKind, 'serverless'>, string> = {
  server: 'backend',
  frontend: 'frontend',
  sdk: 'sdk',
  worker: 'worker',
}

const KINDS: TemplateKind[] = ['server', 'serverless', 'frontend', 'sdk', 'worker']

// A serverless package lives under its provider's directory, so its default has two segments.
export function defaultDir(manifest: Pick<TemplateManifest, 'kind' | 'id'>): string {
  return manifest.kind === 'serverless'
    ? `serverless/${manifest.id}`
    : DEFAULT_DIR_BY_KIND[manifest.kind]
}

// Reserved like `single`: true in every package of a plan that holds an sdk package (ADR 0020 K3).
export const SDK_SELECTION = 'sdk'

// A frontend sees the API package's (server or serverless) flags and capability kinds as
// `server:<name>`.
export const SERVER_PREFIX = 'server:'

// The reserved fact a frontend reads as `server:serverless`: the plan's API is a serverless package
// (ADR 0017 D4). No flag of a server can carry the name.
export const SERVERLESS_FACT = 'serverless'

// Every name any server or serverless template of the catalog declares, so a marker in a frontend
// resolves whichever API the stack brings (and is off for the ones it does not).
export function serverSelectionNames(templates: Iterable<LoadedTemplate>): string[] {
  const names = new Set<string>([SERVERLESS_FACT])
  for (const { manifest } of templates) {
    if (!isApiKind(manifest.kind)) continue
    for (const flag of Object.keys(manifest.flags ?? {})) names.add(flag)
    for (const kind of Object.keys(manifest.capabilities ?? {})) names.add(kind)
  }
  return [...names].sort()
}

export interface DependencyChange {
  remove?: string[]
  add?: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
}

export interface OnlyWhenSpec {
  onlyPaths?: string[]
  dependencies?: { remove: string[] }
  scripts?: { remove: string[] }
}

// Both forms of an onlyWhen value as one shape.
export function onlyWhenSpec(value: string[] | OnlyWhenSpec): OnlyWhenSpec {
  return Array.isArray(value) ? { onlyPaths: value } : value
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
  // Frontend only: what exists only while a selection is on: `server` (the plan has a server
  // package) or `server:<name>` (a flag or capability kind of that server). A path list, or the
  // object form that also removes dependencies and scripts, as a flag does.
  onlyWhen?: Record<string, string[] | OnlyWhenSpec>
  defaultStack?: string
  // Frontend only: false when the template ships no image (no compose.yaml, no deploy mode).
  docker?: boolean
  // Frontend only: the directory the build writes, which the server serves in the single mode.
  static?: { out: string; fallback?: string }
  // Sdk only: the directory its CDN build writes, which the API package serves (ADR 0020 N4).
  cdn?: { out: string }
}

export interface StackManifest {
  schemaVersion: 1
  id: string
  summary: string
  packages: Array<{ template: string; dir: string }>
  // Further frontend templates the stack has been run with beside its own (ADR 0017 D1).
  frontends?: string[]
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
    // A stack case only: <dir>=<template> pairs that take the place of the stack's frontend.
    frontends?: string[]
    // A stack case of another template only: the sdk package of the plan, <dir>=<template>.
    sdk?: string
    flags?: Record<string, boolean>
    capabilities?: Record<string, string>
    // Further packages of the plan by directory, as an answers file's packages.
    packages?: Record<
      string,
      { flags?: Record<string, boolean>; capabilities?: Record<string, string> }
    >
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
  'Adding an entity',
  'Adding the data layer',
  'Errors',
  'Tests',
  'Deployment',
] as const

export const SDK_AGENTS_HEADINGS = [
  'Adding a feature',
  'Public API',
  'Errors',
  'Tests',
  'Styling',
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

// A serverless template is an API that runs as a provider's functions (ADR 0014 K2): what only a
// server image or another package could use is refused, naming the fix.
function checkServerlessManifest(
  templatePath: string,
  manifest: TemplateManifest,
  problems: string[],
): void {
  if (manifest.capabilities !== undefined) {
    problems.push(
      `${templatePath}: capabilities is not for a serverless template: its data engine is part of the base; declare migrate, testDb and e2eDb as commands`,
    )
  }
  const keys = Object.keys(manifest.onlyWhen ?? {}).filter((name) => name !== SDK_SELECTION)
  if (keys.length > 0) {
    problems.push(
      `${templatePath}: onlyWhen is not for a serverless template, which has no other package to key on; gate its files with its own flags (the one key it takes is ${SDK_SELECTION})`,
    )
  }
}

// An sdk template is a library the API package serves (ADR 0020): it has no data engine, no
// static build and no brand, and it names the directory its CDN build writes.
function checkSdkManifest(
  templatePath: string,
  manifest: TemplateManifest,
  problems: string[],
): void {
  if (manifest.cdn === undefined) {
    problems.push(
      `${templatePath}: cdn is required for an sdk template: name the directory its CDN build writes`,
    )
  }
  if (manifest.capabilities !== undefined) {
    problems.push(
      `${templatePath}: capabilities is not for an sdk template, which has no data engine`,
    )
  }
  if (manifest.onlyWhen !== undefined) {
    problems.push(
      `${templatePath}: onlyWhen is not for an sdk template; gate its files with its own flags`,
    )
  }
}

function checkTemplateFiles(
  templatePath: string,
  dir: string,
  manifest: TemplateManifest,
  problems: string[],
): void {
  const base = path.join(dir, 'base')
  if (!existsSync(base)) problems.push(`${templatePath}: base/ is missing`)
  const hasCompose = existsSync(path.join(dir, 'compose.yaml'))
  if (shipsImage(manifest)) {
    if (!hasCompose) problems.push(`${templatePath}: compose.yaml is missing`)
  } else if (hasCompose) {
    const what =
      manifest.kind === 'serverless'
        ? 'a serverless template, which ships no Docker image'
        : 'a template with docker: false, which ships no image'
    problems.push(`${templatePath}: compose.yaml is not for ${what}; delete it`)
  }
  if (manifest.docker !== undefined && manifest.kind !== 'frontend') {
    problems.push(
      `${templatePath}: docker is only for frontend templates, this one is a ${manifest.kind}`,
    )
  }
  if (!existsSync(path.join(base, manifest.agents))) {
    problems.push(`${templatePath}: agents file base/${manifest.agents} is missing`)
  }
  const agentsFile = path.join(base, manifest.agents)
  const required = isApiKind(manifest.kind)
    ? SERVER_AGENTS_HEADINGS
    : manifest.kind === 'frontend'
      ? FRONTEND_AGENTS_HEADINGS
      : manifest.kind === 'sdk'
        ? SDK_AGENTS_HEADINGS
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
  if (manifest.kind === 'serverless') checkServerlessManifest(templatePath, manifest, problems)
  if (manifest.kind === 'sdk') checkSdkManifest(templatePath, manifest, problems)
  if (manifest.cdn !== undefined && manifest.kind !== 'sdk') {
    problems.push(`${templatePath}: cdn is only for sdk templates, this one is a ${manifest.kind}`)
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
  checkOnlyWhenOverlaps(templatePath, manifest, problems)
  for (const [name, value] of Object.entries(manifest.onlyWhen ?? {})) {
    if (manifest.kind === 'server' && name !== SDK_SELECTION) {
      problems.push(`${templatePath}: onlyWhen is not for a server template, which has no ${name}`)
    }
    const spec = onlyWhenSpec(value)
    for (const only of spec.onlyPaths ?? []) {
      if (!existsSync(path.join(base, only))) {
        problems.push(`${templatePath}: onlyWhen "${name}" path "${only}" does not exist in base/`)
      }
    }
    checkOnlyWhenRemovals(templatePath, base, manifest, name, spec, problems)
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

// Every key's removals are independent: `server:*` is off whenever `server` is, so a name or path
// shared by two keys, or by a key and a flag's onlyPaths, would be removed twice, or a directory
// would swallow a file another entry names. Flags among themselves are exempt: the generator
// tolerates a path an earlier flag already removed. Only the lone generation would fail, so refuse it here.
function checkOnlyWhenOverlaps(
  templatePath: string,
  manifest: TemplateManifest,
  problems: string[],
): void {
  const owners: Array<{ owner: string; paths: string[]; flag: boolean }> = []
  const named = new Map<string, string>()
  const note = (kind: string, owner: string, names: readonly string[]) => {
    for (const name of names) {
      const id = `${kind} ${name}`
      const first = named.get(id)
      if (first !== undefined && first !== owner) {
        problems.push(
          `${templatePath}: onlyWhen ${kind} "${name}" is removed by both ${first} and ${owner}`,
        )
      } else named.set(id, owner)
    }
  }
  for (const [key, value] of Object.entries(manifest.onlyWhen ?? {})) {
    const spec = onlyWhenSpec(value)
    const owner = `onlyWhen "${key}"`
    owners.push({ owner, paths: spec.onlyPaths ?? [], flag: false })
    note('dependency', owner, spec.dependencies?.remove ?? [])
    note('script', owner, spec.scripts?.remove ?? [])
  }
  for (const [flag, spec] of Object.entries(manifest.flags ?? {})) {
    owners.push({ owner: `flag "${flag}"`, paths: spec.onlyPaths ?? [], flag: true })
  }
  const clean = (p: string) => p.replace(/\/+$/, '')
  for (const [i, a] of owners.entries()) {
    for (const b of owners.slice(i + 1)) {
      // Two flags may list one path: it exists while every flag that lists it is on (ADR 0014 K5).
      if (a.flag && b.flag) continue
      for (const pa of a.paths.map(clean)) {
        for (const pb of b.paths.map(clean)) {
          if (pa === pb || pa.startsWith(`${pb}/`) || pb.startsWith(`${pa}/`)) {
            problems.push(
              `${templatePath}: ${a.owner} path "${pa}" and ${b.owner} path "${pb}" overlap`,
            )
          }
        }
      }
    }
  }
}

// An onlyWhen entry removes only what the template has: dependencies of the base manifest, scripts
// of its package.json. The pyproject adapter takes none (markers do that), and a name that a flag
// of the same template already removes would be removed twice.
function checkOnlyWhenRemovals(
  templatePath: string,
  base: string,
  manifest: TemplateManifest,
  name: string,
  spec: OnlyWhenSpec,
  problems: string[],
): void {
  const dependencies = spec.dependencies?.remove ?? []
  const scripts = spec.scripts?.remove ?? []
  if (dependencies.length === 0 && scripts.length === 0) return
  const declared = manifest.dependencies
  if (declared === undefined) {
    problems.push(
      `${templatePath}: onlyWhen "${name}" removes dependencies or scripts, but the template declares no dependencies manifest`,
    )
    return
  }
  if (declared.adapter !== 'npm') {
    problems.push(
      `${templatePath}: onlyWhen "${name}" dependencies and scripts are not allowed with the ${declared.adapter} adapter: use markers`,
    )
    return
  }
  const file = path.join(base, declared.manifest)
  let pkg: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    } catch {
      problems.push(
        `${templatePath}: onlyWhen "${name}": base/${declared.manifest} is not valid JSON`,
      )
      return
    }
  }
  const mapOf = (key: string): Record<string, unknown> => {
    const value = pkg[key]
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  }
  for (const dependency of dependencies) {
    if (
      !Object.hasOwn(mapOf('dependencies'), dependency) &&
      !Object.hasOwn(mapOf('devDependencies'), dependency)
    ) {
      problems.push(
        `${templatePath}: onlyWhen "${name}" dependency "${dependency}" is not in base/${declared.manifest}`,
      )
    }
    for (const [flagName, flag] of Object.entries(manifest.flags ?? {})) {
      if (flag.dependencies?.remove?.includes(dependency) === true) {
        problems.push(
          `${templatePath}: onlyWhen "${name}" dependency "${dependency}" is also removed by flag "${flagName}"`,
        )
      }
    }
  }
  for (const script of scripts) {
    if (!Object.hasOwn(mapOf('scripts'), script)) {
      problems.push(
        `${templatePath}: onlyWhen "${name}" script "${script}" is not in base/${declared.manifest} scripts`,
      )
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

// An onlyWhen key must be `server` or `server:<name>` for a flag or capability kind some server declares.
function checkOnlyWhenNames(
  template: LoadedTemplate,
  serverNames: readonly string[],
  problems: string[],
): void {
  for (const name of Object.keys(template.manifest.onlyWhen ?? {})) {
    if (name === 'server') continue
    // An API package keys its files on the sdk; no other kind has the selection to key on.
    if (name === SDK_SELECTION && isApiKind(template.manifest.kind)) continue
    if (
      !name.startsWith(SERVER_PREFIX) ||
      !serverNames.includes(name.slice(SERVER_PREFIX.length))
    ) {
      problems.push(
        `${template.path}: onlyWhen "${name}" is not a server selection; use server, or server:<flag or capability kind> of a server template (${serverNames.map((n) => SERVER_PREFIX + n).join(', ')})`,
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
  if (isApiKind(template.manifest.kind)) {
    problems.push(`${where} has server settings, which only a frontend case takes`)
    return
  }
  const stack = testCase.stack === undefined ? undefined : stacks.get(testCase.stack)
  if (testCase.stack === undefined) {
    problems.push(`${where} has server settings but names no stack`)
    return
  }
  const entry = stack?.manifest.packages.find((pkg) =>
    isApiKind(templates.get(pkg.template)?.manifest.kind ?? ''),
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

// A stack case may list its frontends and set flags on further packages (ADR 0015 F1). The
// first frontend must be this template's and the others frontend templates (ADR 0017), the
// directories the plan's, and the flags declared by the template of the package they land on.
function checkFrontendSettings(
  template: LoadedTemplate,
  testCase: CasesFile['cases'][number],
  stacks: Map<string, LoadedStack>,
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  const frontends = testCase.frontends ?? []
  const packages = testCase.packages ?? {}
  if (frontends.length === 0 && Object.keys(packages).length === 0) return
  const where = `${template.path}: case "${testCase.name}"`
  const stackName =
    testCase.stack ??
    (template.manifest.kind === 'sdk' ? template.manifest.defaultStack : undefined)
  const stack = stackName === undefined ? undefined : stacks.get(stackName)
  if (stackName === undefined) {
    problems.push(`${where} lists frontends or packages but names no stack`)
    return
  }
  if (stack === undefined) return
  // The dir of each package in the plan this case generates, and the template it uses.
  const plan = new Map<string, string>()
  for (const entry of stack.manifest.packages) {
    if (templates.get(entry.template)?.manifest.kind !== 'frontend') {
      plan.set(entry.dir, entry.template)
    }
  }
  const seen = new Set<string>()
  // In a frontend case the first frontend takes the case's own flags, so it is the case's
  // template; in any other case (a Worker beside its frontends) each entry is only a frontend.
  const ownFirst = template.manifest.kind === 'frontend'
  for (const [index, entry] of frontends.entries()) {
    const at = entry.indexOf('=')
    const [dir, used] = [entry.slice(0, at), entry.slice(at + 1)]
    // Another may be another frontend template (ADR 0017); the plan's rules decide whether it fits.
    if (ownFirst && index === 0 && used !== template.path) {
      problems.push(
        `${where} lists frontend "${dir}" with ${used}, but the case is for ${template.path}`,
      )
    } else if ((index > 0 || !ownFirst) && templates.get(used)?.manifest.kind !== 'frontend') {
      problems.push(`${where} lists frontend "${dir}" with ${used}, which is no frontend template`)
    }
    if (seen.has(dir)) problems.push(`${where} lists frontend dir "${dir}" twice`)
    seen.add(dir)
    plan.set(dir, used)
  }
  if (frontends.length === 0) {
    for (const entry of stack.manifest.packages) plan.set(entry.dir, entry.template)
  }
  // The sdk package comes from the request: an sdk template's own case adds itself at sdk-<id>.
  const sdkDir = `sdk-${template.manifest.id}`
  if (template.manifest.kind === 'sdk') plan.set(sdkDir, template.path)
  if (testCase.sdk !== undefined) {
    const at = testCase.sdk.indexOf('=')
    plan.set(testCase.sdk.slice(0, at), testCase.sdk.slice(at + 1))
  }
  // requestFor writes the case's own `flags:` and `server:` under these dirs, over a packages entry.
  const ownDir =
    ownFirst && frontends.length > 0
      ? frontends[0]!.slice(0, frontends[0]!.indexOf('='))
      : undefined
  const primary =
    ownDir ??
    (template.manifest.kind === 'sdk'
      ? sdkDir
      : stack.manifest.packages.find((entry) => entry.template === template.path)?.dir)
  const apiEntry = stack.manifest.packages.find((entry) =>
    isApiKind(templates.get(entry.template)?.manifest.kind ?? ''),
  )
  const setsServer =
    Object.keys(testCase.server?.flags ?? {}).length > 0 ||
    Object.keys(testCase.server?.capabilities ?? {}).length > 0
  for (const [dir, settings] of Object.entries(packages)) {
    const used = plan.get(dir)
    if (used === undefined) {
      problems.push(`${where} sets package "${dir}", which is not in its plan`)
      continue
    }
    if (dir === primary || (setsServer && dir === apiEntry?.dir)) {
      problems.push(
        `${where} sets package "${dir}" under packages, which its own settings replace: use \`flags:\` / \`server:\` for ${dir}`,
      )
    }
    const declared = templates.get(used)?.manifest.flags ?? {}
    for (const flag of Object.keys(settings.flags ?? {})) {
      if (declared[flag] === undefined) {
        problems.push(
          `${where} sets flag "${flag}" on package "${dir}", which ${used} does not declare`,
        )
      }
    }
    for (const [kind, provider] of Object.entries(settings.capabilities ?? {})) {
      const spec = isKind(kind) ? templates.get(used)?.manifest.capabilities?.[kind] : undefined
      if (spec === undefined) {
        problems.push(
          `${where} sets capability "${kind}" on package "${dir}", which ${used} does not declare`,
        )
      } else if (!spec.providers.includes(provider)) {
        problems.push(
          `${where} sets capability ${kind} on package "${dir}" to unlisted provider "${provider}" of ${used}`,
        )
      }
    }
  }
}

// A case's `sdk` is <dir>=<template> of an sdk template, on a stack case of another template; an
// sdk template's own case never carries it, the runner adds the template itself.
function checkSdkSettings(
  template: LoadedTemplate,
  testCase: CasesFile['cases'][number],
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  if (testCase.sdk === undefined) return
  const where = `${template.path}: case "${testCase.name}"`
  if (template.manifest.kind === 'sdk') {
    problems.push(`${where} lists an sdk, but the runner adds the template itself`)
    return
  }
  if (testCase.stack === undefined) {
    problems.push(`${where} lists an sdk but names no stack`)
    return
  }
  const at = testCase.sdk.indexOf('=')
  const [dir, used] = [testCase.sdk.slice(0, at), testCase.sdk.slice(at + 1)]
  if (templates.get(used)?.manifest.kind !== 'sdk') {
    problems.push(`${where} lists sdk "${dir}" with ${used}, which is not an sdk template`)
  }
}

// The Compose smoke builds images and boots them: a template or a stack with none has no app smoke.
function checkWithApp(
  template: LoadedTemplate,
  testCase: CasesFile['cases'][number],
  stacks: Map<string, LoadedStack>,
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  if (testCase.withApp !== true) return
  const where = `${template.path}: case "${testCase.name}" sets withApp, but`
  if (template.manifest.kind === 'sdk') {
    problems.push(`${where} an sdk template has no app smoke: remove withApp`)
  } else if (template.manifest.kind === 'serverless') {
    problems.push(`${where} a serverless template has no app smoke: remove withApp`)
  } else if (template.manifest.docker === false) {
    problems.push(`${where} a template that ships no image has no app smoke: remove withApp`)
  } else {
    const stack = testCase.stack === undefined ? undefined : stacks.get(testCase.stack)
    const serverless = stack?.manifest.packages.some(
      (pkg) => templates.get(pkg.template)?.manifest.kind === 'serverless',
    )
    if (serverless === true) {
      problems.push(`${where} its stack's API is serverless and has no app smoke: remove withApp`)
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
      // <server> is the plan's API package, of either kind.
      const holds = (pkgKind: string | undefined) =>
        kind === 'server' ? isApiKind(pkgKind ?? '') : pkgKind === kind
      if (!kind) {
        problems.push(
          `${template.path}: contract.consumes "${consumes}" must have the form <kind>/<path>`,
        )
      } else if (
        stack &&
        !stack.manifest.packages.some((pkg) => holds(templates.get(pkg.template)?.manifest.kind))
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
      if (testCase.brand !== undefined && manifest.kind !== 'frontend') {
        problems.push(
          `${template.path}: case "${testCase.name}" has a brand, which only a frontend case takes`,
        )
      }
      checkSdkSettings(template, testCase, templates, problems)
      checkWithApp(template, testCase, stacks, templates, problems)
      checkServerSettings(template, testCase, stacks, templates, problems)
      checkFrontendSettings(template, testCase, stacks, templates, problems)
      for (const flag of Object.keys(testCase.flags ?? {})) {
        if (!declared.has(flag)) {
          problems.push(`${template.path}: case "${testCase.name}" uses undeclared flag "${flag}"`)
        }
      }
      if (manifest.kind === 'sdk') {
        // The runner adds the template itself to the stack; a case without `stack:` takes defaultStack.
        const name = testCase.stack ?? manifest.defaultStack
        if (name === undefined) {
          problems.push(
            `${template.path}: case "${testCase.name}" names no stack and the template has no defaultStack`,
          )
        } else if (!stacks.has(name)) {
          problems.push(`${template.path}: case "${testCase.name}" uses unknown stack "${name}"`)
        }
      } else if (testCase.stack) {
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
    const members = stack.manifest.packages.flatMap((pkg) => {
      const loaded = templates.get(pkg.template)
      return loaded === undefined
        ? []
        : [{ dir: pkg.dir, path: loaded.path, manifest: loaded.manifest }]
    })
    for (const problem of memberProblems(members)) problems.push(`${stack.path}: ${problem}`)
    for (const member of members) {
      if (member.manifest.kind === 'sdk') {
        problems.push(
          `${stack.path}: no stack lists an sdk package (${member.path}): it comes from the request, --sdk`,
        )
      }
    }
    const dirs = new Set<string>()
    for (const pkg of stack.manifest.packages) {
      if (!templates.has(pkg.template)) {
        problems.push(`${stack.path}: package template "${pkg.template}" is not a loaded template`)
      }
      if (dirs.has(pkg.dir)) problems.push(`${stack.path}: package dir "${pkg.dir}" is used twice`)
      dirs.add(pkg.dir)
    }
    for (const listed of stack.manifest.frontends ?? []) {
      const loaded = templates.get(listed)
      if (loaded === undefined) {
        problems.push(`${stack.path}: frontends lists "${listed}", which is not a loaded template`)
      } else if (loaded.manifest.kind !== 'frontend') {
        problems.push(
          `${stack.path}: frontends lists "${listed}", which is a ${loaded.manifest.kind}, not a frontend`,
        )
      }
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
