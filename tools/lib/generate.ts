import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
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
import { PROVENANCE_PATH, buildProvenance, catalogIdentity } from './provenance'
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

function buildPackage(plan: GenerationPlan, pkg: PackagePlan, staging: string, log: Log): void {
  const pkgStaging = path.join(staging, pkg.dir)
  copyTree(path.join(pkg.template.dir, 'base'), pkgStaging)
  removeOnlyPaths(pkg, pkgStaging)
  applyMarkerPass(pkg, staging, pkgStaging)
  sweepMarkers(staging, pkgStaging)
  removeDependencies(pkg, pkgStaging)
  const values = packagePlaceholders(plan, pkg, log)
  for (const file of textFiles(pkgStaging)) {
    rewrite(file, (content) => substitutePlaceholders(content, values))
  }
}

function composeFragment(plan: GenerationPlan, pkg: PackagePlan, log: Log): string | undefined {
  const file = path.join(pkg.template.dir, 'compose.yaml')
  if (!existsSync(file)) return undefined
  const where = `${pkg.template.path}/compose.yaml`
  const marked = applyMarkers(readFileSync(file, 'utf8'), ['#', ''], where, pkg.selections)
  const text = substitutePlaceholders(marked, packagePlaceholders(plan, pkg, log))
  // A fragment is written as a whole compose file; assembleCompose takes the service body.
  const parsed: unknown = parse(text)
  const services = (parsed as { services?: Record<string, unknown> } | null)?.services
  const body = services?.[pkg.dir]
  if (body === undefined) {
    throw new GenerateError(`${where}: no service named ${pkg.dir} in the compose fragment`)
  }
  return stringify(body)
}

function writeCompose(catalog: Catalog, plan: GenerationPlan, staging: string, log: Log): void {
  const skeleton = readFileSync(path.join(catalog.root, 'shared', 'docker', 'compose.yaml'), 'utf8')
  const fragments = plan.packages.flatMap((pkg) => {
    const text = composeFragment(plan, pkg, log)
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

function writeRootFiles(catalog: Catalog, plan: GenerationPlan, staging: string, log: Log): void {
  writeCompose(catalog, plan, staging, log)
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
      log(`${pkg.dir}: ${line}`)
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

function moveIntoPlace(plan: GenerationPlan, staging: string, log: Log): void {
  for (const pkg of plan.packages) {
    renameSync(path.join(staging, pkg.dir), path.join(plan.out, pkg.dir))
  }
  // A rerun may have left .fullstack behind; renaming the file over its old copy always works.
  mkdirSync(path.join(plan.out, path.dirname(PROVENANCE_PATH)), { recursive: true })
  renameSync(path.join(staging, PROVENANCE_PATH), path.join(plan.out, PROVENANCE_PATH))
  for (const name of ['docker-compose.yml', '.editorconfig']) {
    if (existsSync(path.join(plan.out, name))) {
      log(`${name} already exists in ${plan.out}; kept`)
    } else {
      renameSync(path.join(staging, name), path.join(plan.out, name))
    }
  }
  renameSync(path.join(staging, '.gitignore'), path.join(plan.out, '.gitignore'))
}

export function generate(
  catalog: Catalog,
  plan: GenerationPlan,
  options: GenerateOptions = {},
): GenerateResult {
  const log = options.log ?? (() => undefined)
  const now = options.now ?? (() => new Date())
  const staging = path.join(plan.out, STAGING_DIR)
  let failed = true
  try {
    mkdirSync(plan.out, { recursive: true })
    if (!statSync(plan.out).isDirectory()) throw new GenerateError(`${plan.out} is not a directory`)
    checkPreconditions(plan, staging)
    for (const pkg of plan.packages) buildPackage(plan, pkg, staging, log)
    writeRootFiles(catalog, plan, staging, log)
    sweepPlaceholders(plan, staging)
    const provenancePath = writeProvenance(catalog, plan, staging, now())
    runPostGenerate(plan, staging, log)
    moveIntoPlace(plan, staging, log)
    failed = false
    return {
      out: plan.out,
      packages: plan.packages.map((p) => p.dir),
      provenancePath: path.join(plan.out, provenancePath),
    }
  } catch (error) {
    if (error instanceof GenerateError) throw error
    throw new GenerateError(error instanceof Error ? error.message : String(error))
  } finally {
    if (!failed || !options.keepStaging) removeTree(staging)
  }
}
