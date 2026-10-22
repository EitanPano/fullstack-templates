import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type { Catalog } from './catalog'
import { requestFor, type GenerationCase } from './cases'
import { browserInstallCommand } from './browsers'
import { runCommand } from './commands'
import { generate } from './generate'
import { resolveRequest } from './plan'

export interface Options {
  e2e: boolean
  installBrowsers: boolean
  keep: boolean
  withServices: boolean
}

export type Runner = (commandLine: string, cwd: string) => void

// A Compose project name is lowercase letters, digits, - and _, starting with a letter or digit.
function projectName(id: string): string {
  const slug = id.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return `fullstack-${slug}-${randomBytes(3).toString('hex')}`
}

function runPackages(
  plan: ReturnType<typeof resolveRequest>,
  out: string,
  options: Options,
  services: boolean,
  run: Runner,
  log: (message: string) => void,
): void {
  for (const pkg of plan.packages) {
    const { commands } = pkg
    const cwd = path.join(out, pkg.dir)
    if (commands.migrate) {
      if (services) run(commands.migrate, cwd)
      else log(`SKIP migrate ${pkg.dir}: needs --with-services`)
    }
    run(commands.check, cwd)
    if (commands.testDb) {
      if (services) run(commands.testDb, cwd)
      else log(`SKIP testDb ${pkg.dir}: needs --with-services`)
    }
    if (options.e2e && commands.testE2e) {
      if (pkg.contractSkipped) log(`SKIP e2e ${pkg.dir}: no server in the plan`)
      else {
        if (options.installBrowsers) run(browserInstallCommand(process.platform), cwd)
        run(commands.testE2e, cwd)
      }
    }
  }
}

// Any throw for one case, expected or not, is that case's FAIL and never aborts the run.
export function runCase(
  catalog: Catalog,
  c: GenerationCase,
  out: string,
  options: Options,
  run: Runner = runCommand,
  log: (message: string) => void = console.log,
): void {
  const plan = resolveRequest(catalog, requestFor(c, out))
  generate(catalog, plan, { log: () => undefined })
  const services = [...new Set(plan.providers.map((p) => p.manifest.service))]
  if (services.length === 0 || !options.withServices) {
    runPackages(plan, out, options, false, run, log)
    return
  }

  const project = projectName(c.id)
  let failure: unknown = null
  try {
    run(`docker compose -p ${project} up -d --wait ${services.join(' ')}`, out)
    runPackages(plan, out, options, true, run, log)
  } catch (error) {
    failure = error
  }
  try {
    run(`docker compose -p ${project} down -v --remove-orphans`, out)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (failure === null) failure = error
    else log(`teardown failed: ${message}`)
  }
  if (failure !== null) throw failure
}
