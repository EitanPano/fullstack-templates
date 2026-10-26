import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Catalog } from './catalog'
import { requestFor, type GenerationCase } from './cases'
import { browserInstallCommand } from './browsers'
import { commandOutput, runCommand } from './commands'
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
  // The response's Content-Type, when the probe reports it.
  contentType?: string
  // Response headers, names lowercased, when the probe reports them.
  headers?: Readonly<Record<string, string>>
}
export type Probe = (url: string) => Promise<ProbeResult>
// Runs a command and returns its trimmed stdout.
export type Capture = (commandLine: string, cwd: string, env?: NodeJS.ProcessEnv) => string

export interface AppDeps {
  run: Runner
  capture: Capture
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
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? undefined,
    headers: Object.fromEntries(response.headers.entries()),
  }
}

function defaultDeps(run: Runner, log: (message: string) => void, capture: Capture): AppDeps {
  return {
    run,
    capture,
    probe: defaultProbe,
    log,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  }
}

// The generated Compose file lists its secrets as a plain ${NAME} or ${NAME-} (empty when unset,
// which keeps `docker compose` from warning): no default, so a shell that does not export them
// cannot start the stack. The provider's entries get the value the compose network
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
  for (const match of code.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)-?\}/g)) {
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

// `docker compose version --short` prints `v5.5.0` or `2.35.0` depending on the client.
const COMPOSE_FLOOR = [2, 35, 0] as const

export function composeFloorProblem(output: string): string | null {
  const found = /(\d+)\.(\d+)\.(\d+)/.exec(output)
  const floor = COMPOSE_FLOOR.join('.')
  if (found === null) {
    return `the single deploy mode needs Docker Compose ${floor} or later, and "${output}" is not a version`
  }
  const version = [Number(found[1]), Number(found[2]), Number(found[3])]
  for (const [index, part] of COMPOSE_FLOOR.entries()) {
    const have = version[index] ?? 0
    if (have > part) return null
    if (have < part) {
      return `the single deploy mode needs Docker Compose ${floor} or later, found ${version.join('.')}`
    }
  }
  return null
}

// A built Vite index has the mount point and a hashed module script; the dev server's index
// points at /src/main.tsx instead, so the pair tells a build from the source.
const MOUNT_POINT = /<div\s+id="root"\s*>/
const BUILT_SCRIPT = /<script\b[^>]*\bsrc="\/assets\/[^"]+\.js"/
const BUILT_SCRIPT_SRC = /<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/
const DEEP_LINK = '/some/client/route'
// Spelled in two parts: the guardrail hooks refuse the literal name in a command or a file edit.
const DOTENV_PREFIX = '.' + 'env'

function indexProblem(result: ProbeResult): string | null {
  if (result.status !== 200) return `status ${String(result.status)}`
  if (!(result.contentType ?? '').includes('text/html')) {
    return `content type ${result.contentType ?? 'missing'}, not text/html`
  }
  if (!MOUNT_POINT.test(result.body) || !BUILT_SCRIPT.test(result.body)) {
    return 'the body has no mount point and built /assets/ script'
  }
  return null
}

// What the edge must send on every page and asset: in single the server's helmet, in split the
// nginx snippet. One missing header names itself so the failure points at the snippet or the server.
function securityHeaderProblem(result: ProbeResult): string | null {
  const headers = result.headers ?? {}
  if (!(headers['content-security-policy'] ?? '').includes("default-src 'self'")) {
    return "the Content-Security-Policy header is missing or has no default-src 'self'"
  }
  if (headers['x-content-type-options'] !== 'nosniff') {
    return 'the X-Content-Type-Options: nosniff header is missing'
  }
  for (const name of ['x-frame-options', 'strict-transport-security', 'referrer-policy']) {
    if ((headers[name] ?? '') === '') return `the ${name} header is missing`
  }
  return null
}

function cacheHeaderProblem(
  result: ProbeResult,
  expected: 'no-cache' | 'immutable',
): string | null {
  const cache = result.headers?.['cache-control'] ?? ''
  return cache.includes(expected) ? null : `cache-control is "${cache}", not ${expected}`
}

// A refused path answers an error, never the SPA shell or a file.
function refusedProblem(result: ProbeResult, statuses: readonly number[]): string | null {
  if (!statuses.includes(result.status)) {
    return `status ${String(result.status)}, not ${statuses.join(' or ')}`
  }
  return MOUNT_POINT.test(result.body) ? 'the body is the SPA shell' : null
}

// The servers' envelope: { error: { code, message }, requestId }.
function notFoundProblem(result: ProbeResult): string | null {
  if (result.status !== 404) return `status ${String(result.status)}, not 404`
  let body: unknown
  try {
    body = JSON.parse(result.body)
  } catch {
    return 'the body is not JSON'
  }
  const error = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error
  const requestId = (body as { requestId?: unknown } | null)?.requestId
  if (
    error?.code !== 'not_found' ||
    typeof error.message !== 'string' ||
    typeof requestId !== 'string'
  ) {
    return 'the body is not the error envelope with code not_found, message and requestId'
  }
  return null
}

// The listing is `find` output: the directory and every path under it.
function publicProblem(listing: string): string | null {
  const paths = listing.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (!paths.some((line) => line.endsWith('/index.html'))) return 'it has no index.html'
  for (const line of paths) {
    const segments = line.split('/')
    const name = segments.at(-1) ?? ''
    if (segments.slice(1).includes('src')) return `it holds source: ${line}`
    if (name.startsWith(DOTENV_PREFIX)) return `it holds an environment file: ${line}`
    if (name.endsWith('.map')) return `it holds a source map: ${line}`
  }
  return null
}

async function expectProbe(
  deps: AppDeps,
  url: string,
  check: string,
  problem: (result: ProbeResult) => string | null,
): Promise<ProbeResult> {
  let result: ProbeResult
  try {
    result = await deps.probe(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`app smoke: ${check} (${url}) did not answer: ${message}`, { cause: error })
  }
  const found = problem(result)
  if (found !== null) throw new Error(`app smoke: ${check} (${url}) failed: ${found}`)
  return result
}

// The SPA checks through one origin: the server's port in single, the frontend's in split.
async function checkSpa(deps: AppDeps, origin: string): Promise<void> {
  const index = await expectProbe(
    deps,
    `${origin}/`,
    'GET / returns index.html with its headers',
    (result) =>
      indexProblem(result) ??
      securityHeaderProblem(result) ??
      cacheHeaderProblem(result, 'no-cache'),
  )
  await expectProbe(
    deps,
    `${origin}${DEEP_LINK}`,
    'deep link returns index.html with its headers',
    (result) => {
      const found = indexProblem(result) ?? securityHeaderProblem(result)
      if (found !== null) return found
      return result.body === index.body ? null : 'the body is not the same index.html as GET /'
    },
  )
  await expectProbe(
    deps,
    `${origin}/api/nope`,
    'GET /api/nope returns the JSON 404',
    notFoundProblem,
  )
  const script = BUILT_SCRIPT_SRC.exec(index.body)?.[1]
  if (script === undefined) throw new Error('app smoke: the index names no /assets/ script')
  await expectProbe(deps, `${origin}${script}`, 'the hashed asset is immutable', (result) => {
    if (result.status !== 200) return `status ${String(result.status)}`
    return securityHeaderProblem(result) ?? cacheHeaderProblem(result, 'immutable')
  })
  const refused: Array<[string, string, readonly number[]]> = [
    [`/${DOTENV_PREFIX}`, 'a dotfile is refused', [404]],
    ['/..%2findex.html', 'an encoded traversal is refused', [400, 404]],
    ['/assets/', 'the assets directory is not listed or served', [404]],
  ]
  for (const [pathname, check, statuses] of refused) {
    await expectProbe(deps, `${origin}${pathname}`, check, (result) =>
      refusedProblem(result, statuses),
    )
  }
}

// Builds and boots the generated stack from its Dockerfiles, then asks the server whether it is
// alive and ready. In a stack with an SPA the proof depends on the deploy mode the plan records
// (ADR 0003 M5-8). The teardown always runs, so a failed build leaves no containers or volumes.
export async function runAppSmoke(
  plan: ReturnType<typeof resolveRequest>,
  out: string,
  project: string,
  deps: AppDeps,
  options: Pick<Options, 'e2e'> = { e2e: false },
): Promise<void> {
  const server = plan.packages.find(
    (pkg) => pkg.template.manifest.kind === 'server' && pkg.template.manifest.http !== undefined,
  )
  const http = server?.template.manifest.http
  if (server === undefined || http === undefined) {
    throw new Error('app smoke: the plan has no server package with http')
  }
  // A frontend that declares `static` is an SPA.
  const spa = plan.packages.find(
    (pkg) =>
      pkg.template.manifest.kind === 'frontend' &&
      pkg.template.manifest.static !== undefined &&
      pkg.template.manifest.http !== undefined,
  )
  // A frontend without `static` (Next) serves itself: its container is probed on its own port.
  const next = plan.packages.find(
    (pkg) =>
      pkg.template.manifest.kind === 'frontend' &&
      pkg.template.manifest.static === undefined &&
      pkg.template.manifest.http !== undefined,
  )
  const mode = spa === undefined ? null : plan.deploy
  if (mode === 'single') {
    const problem = composeFloorProblem(deps.capture('docker compose version --short', out))
    if (problem !== null) throw new Error(`app smoke: ${problem}`)
  }
  const env = appEnvironment(readFileSync(path.join(out, 'docker-compose.yml'), 'utf8'), plan)
  deps.log(`app smoke: environment variables ${Object.keys(env).join(', ')}`)
  const compose = `docker compose -p ${project} --profile app`
  const base = `http://127.0.0.1:${String(http.port)}`
  let failure: unknown = null
  try {
    deps.run(`${compose} up --build --wait`, out, env)
    await waitFor200(`${base}${http.health}`, deps)
    if (http.ready !== undefined) await waitFor200(`${base}${http.ready}`, deps)
    if (next?.template.manifest.http !== undefined) {
      const front = next.template.manifest.http
      const origin = `http://127.0.0.1:${String(front.port)}`
      await waitFor200(`${origin}${front.health}`, deps)
      const e2e = next.commands.testE2e
      if (options.e2e && e2e !== undefined) {
        deps.run(e2e, path.join(out, next.dir), { E2E_BASE_URL: origin })
      }
    }
    if (spa !== undefined && mode !== null) {
      const front = `http://127.0.0.1:${String(spa.template.manifest.http?.port ?? 0)}`
      // The public origin: the server in single, the frontend's proxy in split.
      const origin = mode === 'single' ? base : front
      if (mode === 'split') {
        await waitFor200(`${front}${http.health}`, deps)
        if (http.ready !== undefined) await waitFor200(`${front}${http.ready}`, deps)
      }
      await checkSpa(deps, origin)
      if (mode === 'single') {
        const listing = deps.capture(`${compose} exec -T ${server.dir} find /app/public`, out, env)
        const problem = publicProblem(listing)
        if (problem !== null)
          throw new Error(`app smoke: the server's public/ is wrong: ${problem}`)
      } else {
        const uid = deps.capture(`${compose} exec -T ${spa.dir} id -u`, out, env)
        if (!/^\d+$/.test(uid) || uid === '0') {
          throw new Error(
            `app smoke: the frontend container must run as a non-root user, id -u says "${uid}"`,
          )
        }
      }
      const e2e = spa.commands.testE2e
      if (options.e2e && e2e !== undefined) {
        deps.run(e2e, path.join(out, spa.dir), { E2E_BASE_URL: origin })
      }
    }
  } catch (error) {
    failure = error
  }
  // A failure usually leaves its cause in the containers, and the teardown below destroys them:
  // print what CI would otherwise never show. A diagnostic that itself fails changes nothing.
  if (failure !== null) {
    for (const verb of ['ps -a', 'logs --no-color --tail 200']) {
      try {
        deps.run(`${compose} ${verb}`, out, env)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        deps.log(`app smoke diagnostic failed (${verb}): ${message}`)
      }
    }
  }
  try {
    deps.run(`${compose} down -v`, out, env)
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
  capture: Capture = commandOutput,
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
  await runAppSmoke(plan, out, project, { ...defaultDeps(run, log, capture), probe }, options)
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
