import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
  withApp: boolean
}

// `env` holds only what the command needs on top of the inherited environment.
export type Runner = (commandLine: string, cwd: string, env?: NodeJS.ProcessEnv) => void
export interface ProbeResult {
  status: number
  body: string
}
export type Probe = (url: string) => Promise<ProbeResult>

export interface AppDeps {
  run: Runner
  probe: Probe
  log: (message: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
}

const PROBE_TIMEOUT_MS = 60_000
const PROBE_INTERVAL_MS = 1_000

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

export const defaultProbe: Probe = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
  return { status: response.status, body: await response.text() }
}

function defaultDeps(run: Runner, log: (message: string) => void): AppDeps {
  return {
    run,
    probe: defaultProbe,
    log,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  }
}

// The generated Compose file lists its secrets as a plain ${NAME}: no default, so a shell that does
// not export them cannot start the stack. The provider's entries get the value the compose network
// reaches it with; every other one gets 32 random bytes in base64, which satisfies the server's
// secret rules (length, base64 key of 32 bytes) and differs between variables. Nothing is written
// to disk; the values live in the child environment only.
export function appEnvironment(
  composeText: string,
  plan: ReturnType<typeof resolveRequest>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const provider of plan.providers) {
    for (const entry of provider.manifest.env) env[entry.name] = entry.compose
  }
  // Comments may mention ${VAR} as an example; only the document's own references count.
  const code = composeText.replace(/(^|\s)#.*$/gm, '$1')
  for (const match of code.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const name = match[1]
    if (name !== undefined && env[name] === undefined)
      env[name] = randomBytes(32).toString('base64')
  }
  return env
}

async function waitFor200(url: string, deps: AppDeps): Promise<void> {
  const deadline = deps.now() + PROBE_TIMEOUT_MS
  let last: string
  for (;;) {
    try {
      const result = await deps.probe(url)
      if (result.status === 200) return
      last = `status ${String(result.status)}, body ${result.body.slice(0, 500)}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    if (deps.now() >= deadline) {
      throw new Error(
        `${url} did not answer 200 within ${String(PROBE_TIMEOUT_MS / 1000)}s: ${last}`,
      )
    }
    await deps.sleep(PROBE_INTERVAL_MS)
  }
}

// Builds and boots the generated stack from its Dockerfiles, then asks the server whether it is
// alive and ready. The teardown always runs, so a failed build leaves no containers or volumes.
export async function runAppSmoke(
  plan: ReturnType<typeof resolveRequest>,
  out: string,
  project: string,
  deps: AppDeps,
): Promise<void> {
  const server = plan.packages.find(
    (pkg) => pkg.template.manifest.kind === 'server' && pkg.template.manifest.http !== undefined,
  )
  const http = server?.template.manifest.http
  if (http === undefined) throw new Error('app smoke: the plan has no server package with http')
  const env = appEnvironment(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8'), plan)
  deps.log(`app smoke: environment variables ${Object.keys(env).join(', ')}`)
  const base = `http://127.0.0.1:${String(http.port)}`
  let failure: unknown = null
  try {
    deps.run(`docker compose -p ${project} --profile app up --build --wait`, out, env)
    await waitFor200(`${base}${http.health}`, deps)
    if (http.ready !== undefined) await waitFor200(`${base}${http.ready}`, deps)
  } catch (error) {
    failure = error
  }
  try {
    deps.run(`docker compose -p ${project} --profile app down -v`, out, env)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (failure === null) failure = error
    else deps.log(`app smoke teardown failed: ${message}`)
  }
  if (failure !== null) throw failure
}

// Any throw for one case, expected or not, is that case's FAIL and never aborts the run.
export async function runCase(
  catalog: Catalog,
  c: GenerationCase,
  out: string,
  options: Options,
  run: Runner = runCommand,
  log: (message: string) => void = console.log,
  probe: Probe = defaultProbe,
): Promise<void> {
  const plan = resolveRequest(catalog, requestFor(c, out))
  generate(catalog, plan, { log: () => undefined })
  const project = projectName(c.id)
  runWithServices(plan, out, options, project, run, log)
  if (!c.withApp) return
  if (!options.withApp) {
    log('SKIP app smoke: needs --with-app')
    return
  }
  await runAppSmoke(plan, out, project, { ...defaultDeps(run, log), probe })
}

function runWithServices(
  plan: ReturnType<typeof resolveRequest>,
  out: string,
  options: Options,
  project: string,
  run: Runner,
  log: (message: string) => void,
): void {
  const services = [...new Set(plan.providers.map((p) => p.manifest.service))]
  if (services.length === 0 || !options.withServices) {
    runPackages(plan, out, options, false, run, log)
    return
  }

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
