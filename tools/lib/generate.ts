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
import type { Catalog } from './catalog'
import { CommandError, runCommand } from './commands'
import { assembleCompose, composeServices } from './compose'
import { applyDependencyChange } from './dependencies'
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

function removeOnlyPaths(pkg: PackagePlan, pkgStaging: string): void {
  const specs = pkg.template.manifest.flags ?? {}
  for (const [name, on] of Object.entries(pkg.flags)) {
    if (on) continue
    for (const only of specs[name]?.onlyPaths ?? []) {
      const target = path.join(pkgStaging, only)
      assertInside(pkgStaging, target, `${pkg.dir}: flag ${name} onlyPath`)
      if (!existsSync(target)) {
        throw new GenerateError(
          `${pkg.dir}: flag ${name} lists onlyPaths ${only}, which is missing`,
        )
      }
      removeTree(target)
      pruneEmptyParents(path.dirname(target), pkgStaging)
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
    for (const [index, line] of lines.entries()) {
      const found = findLeftoverMarker(line)
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

function buildPackage(
  pkg: PackagePlan,
  values: Readonly<Record<string, string>>,
  staging: string,
): void {
  const pkgStaging = path.join(staging, pkg.dir)
  copyTree(path.join(pkg.template.dir, 'base'), pkgStaging)
  removeOnlyPaths(pkg, pkgStaging)
  applyMarkerPass(pkg, staging, pkgStaging)
  sweepMarkers(staging, pkgStaging)
  removeDependencies(pkg, pkgStaging)
  for (const file of textFiles(pkgStaging)) {
    rewrite(file, (content) => substitutePlaceholders(content, values))
  }
}

function composeFragment(
  pkg: PackagePlan,
  values: Readonly<Record<string, string>>,
): string | undefined {
  const file = path.join(pkg.template.dir, 'compose.yaml')
  if (!existsSync(file)) return undefined
  const syntax = commentSyntaxFor(file)
  const content = readFileSync(file, 'utf8')
  const marked =
    syntax === undefined
      ? content
      : applyMarkers(content, syntax, `${pkg.template.path}/compose.yaml`, pkg.selections)
  return substitutePlaceholders(marked, values)
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
    const text = composeFragment(pkg, values.get(pkg.dir) ?? {})
    return text === undefined ? [] : [{ service: pkg.dir, text }]
  })
  if (existing !== undefined && fragments.length === 0) return false
  writeFileSync(path.join(staging, 'docker-compose.yml'), assembleCompose(skeleton, fragments))
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
    const { commands, postGenerate = [] } = pkg.template.manifest
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
      buildPackage(pkg, values.get(pkg.dir) ?? {}, staging)
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
