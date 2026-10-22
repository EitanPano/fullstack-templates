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
import { assembleCompose } from './compose'
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

function removeOnlyPaths(pkg: PackagePlan, pkgStaging: string): void {
  const specs = pkg.template.manifest.flags ?? {}
  for (const [name, on] of Object.entries(pkg.flags)) {
    if (on) continue
    for (const only of specs[name]?.onlyPaths ?? []) {
      const target = path.join(pkgStaging, only)
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
    applyDependencyChange(
      path.join(pkgStaging, manifest.dependencies.manifest),
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

function writeCompose(
  catalog: Catalog,
  plan: GenerationPlan,
  values: ReadonlyMap<string, Record<string, string>>,
  staging: string,
): void {
  const skeleton = readFileSync(path.join(catalog.root, 'shared', 'docker', 'compose.yaml'), 'utf8')
  const fragments = plan.packages.flatMap((pkg) => {
    const text = composeFragment(pkg, values.get(pkg.dir) ?? {})
    return text === undefined ? [] : [{ service: pkg.dir, text }]
  })
  writeFileSync(path.join(staging, 'docker-compose.yml'), assembleCompose(skeleton, fragments))
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
): void {
  writeCompose(catalog, plan, perPackage, staging)
  copyTree(
    path.join(catalog.root, 'shared', 'editorconfig', '.editorconfig'),
    path.join(staging, '.editorconfig'),
  )
  writeGitignore(catalog, plan, staging)
  const values = placeholderValues(plan.projectName)
  for (const name of ['docker-compose.yml', '.editorconfig', '.gitignore']) {
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

// Every rename is recorded with its inverse, so a failure part-way puts `out` back as it was.
class Mover {
  private readonly undo: Array<() => void> = []

  constructor(private readonly backupDir: string) {}

  move(from: string, to: string): void {
    if (existsSync(to)) {
      const backup = path.join(this.backupDir, `replaced-${String(this.undo.length)}`)
      renameSync(to, backup)
      this.undo.push(() => renameSync(backup, to))
    }
    renameSync(from, to)
    this.undo.push(() => renameSync(to, from))
  }

  ensureDir(dir: string): void {
    if (existsSync(dir)) return
    mkdirSync(dir, { recursive: true })
    this.undo.push(() => rmSync(dir, { recursive: true, force: true }))
  }

  rollback(): void {
    for (const step of this.undo.reverse()) {
      try {
        step()
      } catch {
        // Keep restoring the rest; the original error is the one worth reporting.
      }
    }
  }
}

function moveIntoPlace(plan: GenerationPlan, staging: string, mover: Mover, log: Log): void {
  for (const pkg of plan.packages) {
    mover.move(path.join(staging, pkg.dir), path.join(plan.out, pkg.dir))
  }
  mover.ensureDir(path.join(plan.out, path.dirname(PROVENANCE_PATH)))
  mover.move(path.join(staging, PROVENANCE_PATH), path.join(plan.out, PROVENANCE_PATH))
  for (const name of ['docker-compose.yml', '.editorconfig']) {
    if (existsSync(path.join(plan.out, name))) {
      log(`${name} already exists in ${plan.out}; kept`)
    } else {
      mover.move(path.join(staging, name), path.join(plan.out, name))
    }
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
    writeRootFiles(catalog, plan, values, staging)
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
    mover.rollback()
    if (error instanceof GenerateError) throw error
    throw new GenerateError(error instanceof Error ? error.message : String(error))
  } finally {
    if (!failed || !options.keepStaging) removeTree(staging)
  }
}
