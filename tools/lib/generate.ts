import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import type { Catalog, LoadedProvider } from './catalog'
import { CommandError, runCommand } from './commands'
import {
  addProvider,
  assembleCompose,
  composeServices,
  wireConsumer,
  type ProviderEnvWiring,
} from './compose'
import { applyDependencyChange, applyScripts } from './dependencies'
import { copyTree, listFiles, pruneEmptyParents, removeTree } from './files'
import { mergeGitignore } from './gitignore'
import { applyMarkers, commentSyntaxFor, findLeftoverMarker } from './markers'
import {
  findLeftoverPlaceholder,
  isTextFile,
  placeholderValues,
  substitutePlaceholders,
} from './placeholders'
import type { GenerationPlan, PackagePlan } from './plan'
import { PROVENANCE_PATH, buildProvenance, catalogIdentity, type Provenance } from './provenance'
import { validateAgainst } from './schema'

export const STAGING_DIR = '.fullstack-staging'

const DEFAULT_SERVER = { dir: 'backend', port: '4000' }

export interface GenerateOptions {
  keepStaging?: boolean
  now?: () => Date
  log?: (line: string) => void
}

export interface GenerateResult {
  out: string
  packages: string[]
  provenancePath: string
}

export class GenerateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerateError'
  }
}

type Log = (line: string) => void

export function packagePlaceholders(
  plan: GenerationPlan,
  pkg: PackagePlan,
  log: Log = () => undefined,
): Record<string, string> {
  if (pkg.serverDir === null || pkg.serverPort === null) {
    log(
      `${pkg.dir}: the plan has no server package, server references assume ${DEFAULT_SERVER.dir}:${DEFAULT_SERVER.port}`,
    )
  }
  const http = pkg.template.manifest.http
  return {
    ...placeholderValues(plan.projectName),
    PACKAGE_DIR: pkg.dir,
    PORT: http === undefined ? '' : String(http.port),
    SERVER_DIR: pkg.serverDir ?? DEFAULT_SERVER.dir,
    SERVER_PORT: pkg.serverPort === null ? DEFAULT_SERVER.port : String(pkg.serverPort),
  }
}

function toWhere(staging: string, file: string): string {
  return path.relative(staging, file).split(path.sep).join('/')
}

function textFiles(dir: string): string[] {
  return listFiles(dir).filter(isTextFile)
}

function rewrite(file: string, transform: (content: string) => string): void {
  const before = readFileSync(file, 'utf8')
  const after = transform(before)
  if (after !== before) writeFileSync(file, after)
}

function checkPreconditions(plan: GenerationPlan, staging: string): void {
  for (const pkg of plan.packages) {
    const target = path.join(plan.out, pkg.dir)
    if (existsSync(target)) throw new GenerateError(`${target} already exists; nothing was written`)
  }
  removeTree(staging)
  mkdirSync(staging, { recursive: true })
}

// Schemas constrain manifest paths, but a staged path is the last line before a delete or a write.
export function assertInside(root: string, target: string, what: string): void {
  const base = path.resolve(root)
  const resolved = path.resolve(target)
  if (!resolved.startsWith(base + path.sep)) {
    throw new GenerateError(`${what} resolves outside the package: ${target}`)
  }
}

function removeOnlyPath(pkg: PackagePlan, pkgStaging: string, only: string, owner: string): void {
  const target = path.join(pkgStaging, only)
  assertInside(pkgStaging, target, `${pkg.dir}: ${owner} onlyPath`)
  if (!existsSync(target)) {
    throw new GenerateError(`${pkg.dir}: ${owner} lists onlyPaths ${only}, which is missing`)
  }
  removeTree(target)
  pruneEmptyParents(path.dirname(target), pkgStaging)
}

// A flag that is off removes the template's onlyPaths and each selected overlay's own, after the
// overlay copy, so a capability can add a file that exists only while the flag is on.
function removeOnlyPaths(pkg: PackagePlan, pkgStaging: string): void {
  const specs = pkg.template.manifest.flags ?? {}
  for (const [name, on] of Object.entries(pkg.flags)) {
    if (on) continue
    for (const only of specs[name]?.onlyPaths ?? []) {
      removeOnlyPath(pkg, pkgStaging, only, `flag ${name}`)
    }
    for (const overlay of pkg.overlays) {
      for (const only of overlay.manifest.flags?.[name]?.onlyPaths ?? []) {
        const owner = `flag ${name} (capability ${overlay.kind}/${overlay.provider})`
        removeOnlyPath(pkg, pkgStaging, only, owner)
      }
    }
  }
}

function applyMarkerPass(pkg: PackagePlan, staging: string, pkgStaging: string): void {
  for (const file of textFiles(pkgStaging)) {
    const syntax = commentSyntaxFor(file)
    if (syntax === undefined) continue
    rewrite(file, (content) =>
      applyMarkers(content, syntax, toWhere(staging, file), pkg.selections),
    )
  }
}

function sweepMarkers(staging: string, pkgStaging: string): void {
  for (const file of textFiles(pkgStaging)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    const syntax = commentSyntaxFor(file)
    for (const [index, line] of lines.entries()) {
      const found = findLeftoverMarker(line, syntax)
      if (found !== null) {
        throw new GenerateError(
          `${toWhere(staging, file)}:${String(index + 1)}: undeclared marker ${found}`,
        )
      }
    }
  }
}

function removeDependencies(pkg: PackagePlan, pkgStaging: string): void {
  const { manifest } = pkg.template
  if (manifest.dependencies === undefined) return
  for (const [name, on] of Object.entries(pkg.flags)) {
    const change = manifest.flags?.[name]?.dependencies
    if (on || change === undefined) continue
    const manifestFile = path.join(pkgStaging, manifest.dependencies.manifest)
    assertInside(pkgStaging, manifestFile, `${pkg.dir}: dependencies.manifest`)
    applyDependencyChange(
      manifestFile,
      manifest.dependencies.adapter,
      change,
      `${pkg.dir} (flag ${name})`,
    )
  }
}

// Overlays are copied before the flags run, so a flag's onlyPaths and markers also reach the
// files a capability adds or replaces.
function copyOverlays(pkg: PackagePlan, pkgStaging: string): void {
  for (const overlay of pkg.overlays) copyTree(overlay.overlayDir, pkgStaging)
}

function applyCapabilities(pkg: PackagePlan, pkgStaging: string): void {
  const { dependencies } = pkg.template.manifest
  for (const overlay of pkg.overlays) {
    const { dependencies: change, scripts } = overlay.manifest
    if (change === undefined && scripts === undefined) continue
    const where = `${pkg.dir} (capability ${overlay.kind}/${overlay.provider})`
    if (dependencies === undefined) {
      throw new GenerateError(`${where}: the template declares no dependencies manifest`)
    }
    const manifestFile = path.join(pkgStaging, dependencies.manifest)
    assertInside(pkgStaging, manifestFile, `${pkg.dir}: dependencies.manifest`)
    if (change !== undefined) {
      applyDependencyChange(manifestFile, dependencies.adapter, change, where)
    }
    if (scripts !== undefined) applyScripts(manifestFile, dependencies.adapter, scripts, where)
  }
}

function providerOf(
  providers: readonly LoadedProvider[],
  kind: string,
  id: string,
): LoadedProvider {
  const found = providers.find((p) => p.kind === kind && p.id === id)
  if (found === undefined) throw new GenerateError(`provider ${kind}/${id} is not in the plan`)
  return found
}

// One group per entry: what it is, what the tests use, and the local value.
function appendEnvExample(
  pkg: PackagePlan,
  pkgStaging: string,
  providers: readonly LoadedProvider[],
): void {
  const groups: string[][] = []
  for (const overlay of pkg.overlays) {
    const provider = providerOf(providers, overlay.kind, overlay.provider)
    for (const entry of provider.manifest.env) {
      groups.push([
        `# ${provider.kind}/${provider.id} provider`,
        `# ${entry.summary}`,
        entry.testOverride === undefined
          ? `# Tests (testDb) use ${entry.test}.`
          : `# Tests (testDb) use ${entry.test}; override with ${entry.testOverride}.`,
        `${entry.name}=${entry.local}`,
      ])
    }
  }
  if (groups.length === 0) return
  const file = path.join(pkgStaging, '.env.example')
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const terminated = existing === '' || existing.endsWith('\n') ? existing : existing + eol
  // A new file starts with the first group; after existing content a blank line separates them.
  const body = groups
    .map((lines, index) => (terminated === '' && index === 0 ? '' : eol) + lines.join(eol) + eol)
    .join('')
  writeFileSync(file, terminated + body)
}

function buildPackage(
  pkg: PackagePlan,
  values: Readonly<Record<string, string>>,
  providers: readonly LoadedProvider[],
  staging: string,
): void {
  const pkgStaging = path.join(staging, pkg.dir)
  copyTree(path.join(pkg.template.dir, 'base'), pkgStaging)
  copyOverlays(pkg, pkgStaging)
  removeOnlyPaths(pkg, pkgStaging)
  applyMarkerPass(pkg, staging, pkgStaging)
  sweepMarkers(staging, pkgStaging)
  removeDependencies(pkg, pkgStaging)
  applyCapabilities(pkg, pkgStaging)
  for (const file of textFiles(pkgStaging)) {
    rewrite(file, (content) => substitutePlaceholders(content, values))
  }
  appendEnvExample(pkg, pkgStaging, providers)
}

function composeFragment(
  pkg: PackagePlan,
  values: Readonly<Record<string, string>>,
  providers: readonly LoadedProvider[],
): string | undefined {
  const file = path.join(pkg.template.dir, 'compose.yaml')
  if (!existsSync(file)) return undefined
  const syntax = commentSyntaxFor(file)
  const content = readFileSync(file, 'utf8')
  const marked =
    syntax === undefined
      ? content
      : applyMarkers(content, syntax, `${pkg.template.path}/compose.yaml`, pkg.selections)
  const text = substitutePlaceholders(marked, values)
  if (pkg.overlays.length === 0) return text
  const wirings: ProviderEnvWiring[] = pkg.overlays.map((overlay) => {
    const { manifest } = providerOf(providers, overlay.kind, overlay.provider)
    return {
      service: manifest.service,
      env: manifest.env.map(({ name, compose, secret }) => ({ name, compose, secret })),
    }
  })
  return wireConsumer(pkg.dir, text, wirings)
}

// A rerun adds packages to a project: the existing docker-compose.yml is the skeleton and only
// the services it lacks are added, like .gitignore. Returns false when nothing needs writing.
function writeCompose(
  catalog: Catalog,
  plan: GenerationPlan,
  values: ReadonlyMap<string, Record<string, string>>,
  staging: string,
  log: Log,
): boolean {
  const existingFile = path.join(plan.out, 'docker-compose.yml')
  const existing = existsSync(existingFile) ? readFileSync(existingFile, 'utf8') : undefined
  const skeleton =
    existing ?? readFileSync(path.join(catalog.root, 'shared', 'docker', 'compose.yaml'), 'utf8')
  const present = existing === undefined ? new Set<string>() : composeServices(existing)
  const fragments = plan.packages.flatMap((pkg) => {
    if (present.has(pkg.dir)) {
      log(`docker-compose.yml already has service ${pkg.dir}; kept`)
      return []
    }
    const text = composeFragment(pkg, values.get(pkg.dir) ?? {}, plan.providers)
    return text === undefined ? [] : [{ service: pkg.dir, text }]
  })
  const missing = plan.providers.filter((p) => !present.has(p.manifest.service))
  if (existing !== undefined && fragments.length === 0 && missing.length === 0) {
    for (const provider of plan.providers) {
      log(`docker-compose.yml already has service ${provider.manifest.service}; kept`)
    }
    return false
  }
  const text = plan.providers.reduce(
    (current, provider) =>
      addProvider(
        current,
        provider.manifest.service,
        readFileSync(path.join(provider.dir, provider.manifest.compose), 'utf8'),
        log,
      ),
    assembleCompose(skeleton, fragments),
  )
  writeFileSync(path.join(staging, 'docker-compose.yml'), text)
  return true
}

function writeGitignore(catalog: Catalog, plan: GenerationPlan, staging: string): void {
  const ecosystems = ['base', ...plan.packages.flatMap((p) => p.template.manifest.gitignore ?? [])]
  const sections = [...new Set(ecosystems)].map((name) => ({
    name,
    body: readFileSync(path.join(catalog.root, 'shared', 'gitignore', `${name}.gitignore`), 'utf8'),
  }))
  const existingFile = path.join(plan.out, '.gitignore')
  const existing = existsSync(existingFile) ? readFileSync(existingFile, 'utf8') : undefined
  writeFileSync(path.join(staging, '.gitignore'), mergeGitignore(existing, sections))
}

function writeRootFiles(
  catalog: Catalog,
  plan: GenerationPlan,
  perPackage: ReadonlyMap<string, Record<string, string>>,
  staging: string,
  log: Log,
): void {
  const composeWritten = writeCompose(catalog, plan, perPackage, staging, log)
  writeProviderFiles(plan, staging)
  copyTree(
    path.join(catalog.root, 'shared', 'editorconfig', '.editorconfig'),
    path.join(staging, '.editorconfig'),
  )
  writeGitignore(catalog, plan, staging)
  const values = placeholderValues(plan.projectName)
  const written = ['docker-compose.yml', '.editorconfig', '.gitignore'].filter(
    (name) => name !== 'docker-compose.yml' || composeWritten,
  )
  for (const name of written) {
    rewrite(path.join(staging, name), (content) => substitutePlaceholders(content, values))
  }
}

// Files a provider ships for the project root (database init scripts). They are staged like the
// other root files; moveIntoPlace never overwrites one the project already has.
function providerFiles(plan: GenerationPlan): string[] {
  return [...new Set(plan.providers.flatMap((p) => p.manifest.files ?? []))]
}

function writeProviderFiles(plan: GenerationPlan, staging: string): void {
  const values = placeholderValues(plan.projectName)
  for (const provider of plan.providers) {
    for (const file of provider.manifest.files ?? []) {
      const from = path.join(provider.dir, file)
      const to = path.join(staging, file)
      const what = `provider ${provider.kind}/${provider.id} file`
      assertInside(provider.dir, from, what)
      assertInside(staging, to, what)
      mkdirSync(path.dirname(to), { recursive: true })
      copyTree(from, to)
      if (isTextFile(to)) rewrite(to, (content) => substitutePlaceholders(content, values))
    }
  }
}

function sweepPlaceholders(plan: GenerationPlan, staging: string): void {
  const names = [...new Set(plan.packages.flatMap((p) => p.template.manifest.placeholders))]
  for (const file of textFiles(staging)) {
    const left = findLeftoverPlaceholder(readFileSync(file, 'utf8'), names)
    if (left !== null) {
      throw new GenerateError(`${toWhere(staging, file)}: unreplaced placeholder ${left}`)
    }
  }
}

function writeProvenance(
  catalog: Catalog,
  plan: GenerationPlan,
  staging: string,
  now: Date,
): string {
  const provenance = buildProvenance(plan, catalogIdentity(catalog.root, plan.catalogVersion), now)
  // A rerun adds packages to a project; the ones generated earlier stay recorded.
  const earlier = path.join(plan.out, PROVENANCE_PATH)
  if (existsSync(earlier)) {
    const previous = parse(readFileSync(earlier, 'utf8')) as Partial<Provenance> | null
    provenance.packages = { ...previous?.packages, ...provenance.packages }
    provenance.providers = { ...previous?.providers, ...provenance.providers }
  }
  const errors = validateAgainst('provenance', provenance)
  if (errors.length > 0) throw new GenerateError(`provenance is invalid: ${errors.join('; ')}`)
  const file = path.join(staging, PROVENANCE_PATH)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, stringify(provenance))
  return PROVENANCE_PATH
}

function runPostGenerate(plan: GenerationPlan, staging: string, log: Log): void {
  if (plan.skipPostGenerate) return
  for (const pkg of plan.packages) {
    const { postGenerate = [] } = pkg.template.manifest
    const { commands } = pkg
    for (const name of postGenerate) {
      const line = commands[name]
      if (line === undefined) {
        throw new GenerateError(`${pkg.dir}: postGenerate names ${name}, which has no command`)
      }
      if (name === 'contract' && pkg.contractSkipped) {
        log(`${pkg.dir}: contract step skipped, the plan has no server package`)
        continue
      }
      log(`==> ${pkg.dir}: ${line}`)
      const env = pkg.serverDir === null ? undefined : { FULLSTACK_SERVER_DIR: pkg.serverDir }
      try {
        runCommand(line, path.join(staging, pkg.dir), env)
      } catch (error) {
        if (error instanceof CommandError) {
          throw new GenerateError(`${pkg.dir}: postGenerate ${name} failed: ${line}`)
        }
        throw error
      }
    }
  }
}

const RENAME_ATTEMPTS = 5
const RENAME_DELAY_MS = 100
const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

// Every rename is recorded with its inverse, so a failure part-way puts `out` back as it was.
export class Mover {
  private readonly undo: Array<() => void> = []
  private readonly backups: string[] = []

  constructor(
    private readonly backupDir: string,
    private readonly rename: (from: string, to: string) => void = renameSync,
    private readonly sleep: (ms: number) => void = Bun.sleepSync,
  ) {}

  // On Windows the final move can fail with EPERM right after the post-generate commands ran in
  // staging (a lingering file handle or an antivirus scan); the same rename succeeds shortly
  // after. Only `move` retries: a rollback step that fails must be reported, not repeated.
  private renameWithRetry(from: string, to: string): void {
    for (let attempt = 1; ; attempt += 1) {
      try {
        this.rename(from, to)
        return
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (
          attempt >= RENAME_ATTEMPTS ||
          typeof code !== 'string' ||
          !TRANSIENT_RENAME_CODES.has(code)
        )
          throw error
        this.sleep(RENAME_DELAY_MS * attempt)
      }
    }
  }

  move(from: string, to: string): void {
    if (existsSync(to)) {
      const backup = path.join(this.backupDir, `replaced-${String(this.undo.length)}`)
      this.renameWithRetry(to, backup)
      this.backups.push(backup)
      this.undo.push(() => this.rename(backup, to))
    }
    this.renameWithRetry(from, to)
    this.undo.push(() => this.rename(to, from))
  }

  ensureDir(dir: string): void {
    if (existsSync(dir)) return
    mkdirSync(dir, { recursive: true })
    this.undo.push(() => rmSync(dir, { recursive: true, force: true }))
  }

  // Keeps restoring after a failed step. Returns the backup paths when any step failed, because
  // then the staging directory holds the only copy of what was replaced and must survive.
  rollback(): string[] | null {
    let failed = false
    for (const step of this.undo.reverse()) {
      try {
        step()
      } catch {
        failed = true
      }
    }
    return failed ? [...this.backups] : null
  }
}

function moveIntoPlace(plan: GenerationPlan, staging: string, mover: Mover, log: Log): void {
  for (const pkg of plan.packages) {
    mover.move(path.join(staging, pkg.dir), path.join(plan.out, pkg.dir))
  }
  mover.ensureDir(path.join(plan.out, path.dirname(PROVENANCE_PATH)))
  mover.move(path.join(staging, PROVENANCE_PATH), path.join(plan.out, PROVENANCE_PATH))
  // The merged compose file replaces the old one (the Mover keeps a backup for the rollback).
  if (existsSync(path.join(staging, 'docker-compose.yml'))) {
    mover.move(path.join(staging, 'docker-compose.yml'), path.join(plan.out, 'docker-compose.yml'))
  }
  if (existsSync(path.join(plan.out, '.editorconfig'))) {
    log(`.editorconfig already exists in ${plan.out}; kept`)
  } else {
    mover.move(path.join(staging, '.editorconfig'), path.join(plan.out, '.editorconfig'))
  }
  mover.move(path.join(staging, '.gitignore'), path.join(plan.out, '.gitignore'))
  for (const file of providerFiles(plan)) {
    const target = path.join(plan.out, file)
    if (existsSync(target)) {
      log(`${file} already exists in ${plan.out}; kept`)
      continue
    }
    ensureParents(mover, plan.out, file)
    mover.move(path.join(staging, file), target)
  }
}

// Each missing ancestor is recorded, so a rollback removes exactly what this run created.
function ensureParents(mover: Mover, root: string, file: string): void {
  let current = root
  for (const part of path.dirname(file).split(/[\\/]/)) {
    if (part === '' || part === '.') continue
    current = path.join(current, part)
    mover.ensureDir(current)
  }
}

export function generate(
  catalog: Catalog,
  plan: GenerationPlan,
  options: GenerateOptions = {},
): GenerateResult {
  const log = options.log ?? (() => undefined)
  const now = options.now ?? (() => new Date())
  const staging = path.join(plan.out, STAGING_DIR)
  const mover = new Mover(staging)
  let failed = true
  let keepForRecovery = false
  try {
    mkdirSync(plan.out, { recursive: true })
    if (!statSync(plan.out).isDirectory()) throw new GenerateError(`${plan.out} is not a directory`)
    checkPreconditions(plan, staging)
    log(`==> Staging in ${staging}`)
    const values = new Map(plan.packages.map((p) => [p.dir, packagePlaceholders(plan, p, log)]))
    for (const pkg of plan.packages) {
      log(`==> Preparing ${pkg.dir} from ${pkg.template.path}`)
      buildPackage(pkg, values.get(pkg.dir) ?? {}, plan.providers, staging)
    }
    log('==> Assembling root files')
    writeRootFiles(catalog, plan, values, staging, log)
    sweepPlaceholders(plan, staging)
    log(`==> Writing ${PROVENANCE_PATH}`)
    const provenancePath = writeProvenance(catalog, plan, staging, now())
    runPostGenerate(plan, staging, log)
    log(`==> Moving into ${plan.out}`)
    moveIntoPlace(plan, staging, mover, log)
    failed = false
    return {
      out: plan.out,
      packages: plan.packages.map((p) => p.dir),
      provenancePath: path.join(plan.out, provenancePath),
    }
  } catch (error) {
    const stranded = mover.rollback()
    const base = error instanceof Error ? error.message : String(error)
    if (stranded !== null) {
      keepForRecovery = true
      const backups = stranded.length > 0 ? ` and the replaced files in ${stranded.join(', ')}` : ''
      const where = `staging kept at ${staging}${backups}`
      throw new GenerateError(`${base}\nrollback failed: ${plan.out} may be half-written; ${where}`)
    }
    if (error instanceof GenerateError) throw error
    throw new GenerateError(base)
  } finally {
    if (!keepForRecovery && (!failed || !options.keepStaging)) removeTree(staging)
  }
}
