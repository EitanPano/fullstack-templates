import {
  CAPABILITY_KINDS,
  DEFAULT_DIR_BY_KIND,
  DEPLOY_MODES,
  type Catalog,
  type CapabilitySpec,
  type CommandName,
  type DeployMode,
  type LoadedOverlay,
  type LoadedProvider,
  type LoadedTemplate,
} from './catalog'
import { isKind } from './capability-kinds'
import { migrateServiceName } from './compose'
import { toProjectName } from './placeholders'

export interface Answers {
  projectName?: string
  // Validated in resolveRequest, so a bad value from a JSON file names the reason.
  deploy?: string
  packages?: Record<
    string,
    { flags?: Record<string, boolean>; capabilities?: Record<string, string> }
  >
}

export interface RequestInput {
  out: string
  name: string
  stack?: string
  template?: string
  dir?: string
  flags: string[]
  capabilities: string[]
  answers?: Answers
  catalogVersion?: string
  skipPostGenerate: boolean
  // The --deploy value; overrides the answers file like a flag shorthand does.
  deploy?: string
}

export interface PackagePlan {
  dir: string
  template: LoadedTemplate
  flags: Record<string, boolean>
  // Kind to provider id, only the selected ones.
  capabilities: Record<string, string>
  // The selected overlays, in the order the template declares its capability kinds.
  overlays: LoadedOverlay[]
  // The template's commands plus those of each selected overlay.
  commands: Partial<Record<CommandName, string>> & { check: string }
  selections: Record<string, boolean>
  serverDir: string | null
  serverPort: number | null
  // The frontend package's directory, null when the plan has none (__FRONTEND_DIR__).
  frontendDir: string | null
  // The server package's dev command, null when the plan has no server (or it declares none).
  serverDevCommand: string | null
  contractSkipped: boolean
}

export interface GenerationPlan {
  out: string
  projectName: string
  stackId: string | null
  packages: PackagePlan[]
  // Providers selected by any package, unique, ordered by kind then id.
  providers: LoadedProvider[]
  catalogVersion: string | undefined
  skipPostGenerate: boolean
  // Null unless the plan has both a server and a frontend: a lone package has no mode to choose.
  deploy: DeployMode | null
}

export const DIR_PATTERN = /^[a-z][a-z0-9-]*$/

export class PlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanError'
  }
}

interface Member {
  dir: string
  template: LoadedTemplate
}

function resolveMembers(
  catalog: Catalog,
  input: RequestInput,
): { members: Member[]; stackId: string | null } {
  if ((input.stack === undefined) === (input.template === undefined)) {
    throw new PlanError('give exactly one of a stack and a template')
  }
  if (input.stack !== undefined) {
    if (input.dir !== undefined) throw new PlanError('--dir only applies with --template')
    const stack = catalog.stacks.get(input.stack)
    if (!stack) throw new PlanError(`unknown stack: ${input.stack}`)
    const members = stack.manifest.packages.map((entry) => {
      const template = catalog.templates.get(entry.template)
      if (!template)
        throw new PlanError(`stack ${input.stack} uses unknown template ${entry.template}`)
      return { dir: entry.dir, template }
    })
    return { members, stackId: input.stack }
  }
  const template = catalog.templates.get(input.template as string)
  if (!template) throw new PlanError(`unknown template: ${input.template}`)
  const dir = input.dir ?? DEFAULT_DIR_BY_KIND[template.manifest.kind]
  if (!DIR_PATTERN.test(dir)) throw new PlanError(`invalid package dir: ${dir}`)
  return { members: [{ dir, template }], stackId: null }
}

// Producers first so a consumer's contract step finds the server's contract file.
function orderForContract(members: Member[]): Member[] {
  const consumes = (m: Member) =>
    m.template.manifest.contract !== undefined && 'consumes' in m.template.manifest.contract
  return [...members.filter((m) => !consumes(m)), ...members.filter(consumes)]
}

function parsePair(entry: string, what: string): [string, string] {
  const at = entry.indexOf('=')
  if (at <= 0 || at === entry.length - 1)
    throw new PlanError(`${what} must read name=value: ${entry}`)
  return [entry.slice(0, at), entry.slice(at + 1)]
}

function routeShorthandFlags(
  members: Member[],
  entries: string[],
): Map<string, Record<string, boolean>> {
  const routed = new Map<string, Record<string, boolean>>()
  for (const entry of entries) {
    const [name, value] = parsePair(entry, 'a flag')
    if (value !== 'true' && value !== 'false') {
      throw new PlanError(`flag ${name} must be true or false, got ${value}`)
    }
    const owners = members.filter((m) => m.template.manifest.flags?.[name] !== undefined)
    if (owners.length === 0) throw new PlanError(`unknown flag: ${name}`)
    if (owners.length > 1) {
      const dirs = owners.map((m) => m.dir).join(' and ')
      throw new PlanError(
        `flag ${name} is ambiguous: declared by ${dirs}; set it in an answers file`,
      )
    }
    const dir = (owners[0] as Member).dir
    routed.set(dir, { ...routed.get(dir), [name]: value === 'true' })
  }
  return routed
}

// A declared kind with an empty provider list still counts as declared.
function declaredSpec(template: LoadedTemplate, kind: string): CapabilitySpec | undefined {
  return isKind(kind) ? template.manifest.capabilities?.[kind] : undefined
}

function routeShorthandCapabilities(
  members: Member[],
  entries: string[],
): Map<string, Record<string, string>> {
  const routed = new Map<string, Record<string, string>>()
  for (const entry of entries) {
    const [kind, provider] = parsePair(entry, 'a capability')
    const owners = members.filter((m) => declaredSpec(m.template, kind) !== undefined)
    if (owners.length === 0) throw new PlanError(`unknown capability: ${kind}`)
    if (owners.length > 1) {
      const dirs = owners.map((m) => m.dir).join(' and ')
      throw new PlanError(
        `capability ${kind} is ambiguous: declared by ${dirs}; set it in an answers file`,
      )
    }
    const owner = owners[0] as Member
    assertListed(owner, kind, provider)
    routed.set(owner.dir, { ...routed.get(owner.dir), [kind]: provider })
  }
  return routed
}

// "server" and "single" are reserved: a manifest cannot declare a flag of either name. A marker
// asks whether the plan has a server package (a lone frontend must not depend on one) and whether
// the plan deploys as one image, which only a plan with a server can.
export const SERVER_SELECTION = 'server'
export const SINGLE_SELECTION = 'single'

// Shared by the plan and the marker dry-run so the two cannot drift: every flag, the reserved
// server and single, then per declared kind `<kind>` (a provider is selected) and `<kind>:<provider>` for
// each provider the template lists.
export function selectionsFor(
  template: LoadedTemplate,
  flags: Record<string, boolean>,
  hasServer: boolean,
  single: boolean,
  capabilities: Record<string, string>,
): Record<string, boolean> {
  const selections: Record<string, boolean> = {
    ...flags,
    [SERVER_SELECTION]: hasServer,
    [SINGLE_SELECTION]: hasServer && single,
  }
  for (const [kind, spec] of Object.entries(template.manifest.capabilities ?? {})) {
    selections[kind] = capabilities[kind] !== undefined
    for (const provider of spec.providers) {
      selections[`${kind}:${provider}`] = capabilities[kind] === provider
    }
  }
  return selections
}

function isDeployMode(value: string): value is DeployMode {
  return (DEPLOY_MODES as readonly string[]).includes(value)
}

// The mode of a plan with a server and a frontend; null for a lone package, where only split is
// accepted (it is true of any one package) and single has nothing to join.
function resolveDeploy(
  requested: string | undefined,
  server: Member | undefined,
  frontend: Member | undefined,
): DeployMode | null {
  if (requested !== undefined && !isDeployMode(requested)) {
    throw new PlanError(`unknown deploy mode "${requested}": expected ${DEPLOY_MODES.join(' or ')}`)
  }
  const servable = frontend?.template.manifest.static !== undefined
  if (requested === 'single') {
    if (server === undefined) {
      throw new PlanError('deploy single needs a server package in the plan, which has none')
    }
    if (frontend === undefined) {
      throw new PlanError('deploy single needs a frontend package in the plan, which has none')
    }
    if (!servable) {
      throw new PlanError(
        `${frontend.template.path} declares no static, so deploy single cannot serve it from the server`,
      )
    }
  }
  if (server === undefined || frontend === undefined) return null
  return requested ?? (servable ? 'single' : 'split')
}

function assertListed(member: Member, kind: string, provider: string): void {
  const spec = declaredSpec(member.template, kind)
  if (spec === undefined) {
    throw new PlanError(`unknown capability for ${member.dir}: ${kind}`)
  }
  if (!spec.providers.includes(provider)) {
    const listed =
      spec.providers.length === 0 ? 'it lists none' : `it lists ${spec.providers.join(', ')}`
    throw new PlanError(
      `${member.dir} has no provider "${provider}" for capability ${kind}: ${listed}`,
    )
  }
}

function overlaysFor(member: Member, capabilities: Record<string, string>): LoadedOverlay[] {
  const overlays: LoadedOverlay[] = []
  for (const kind of Object.keys(member.template.manifest.capabilities ?? {})) {
    const provider = capabilities[kind]
    if (provider === undefined) continue
    const overlay = member.template.overlays.get(`${kind}/${provider}`)
    if (overlay === undefined) {
      throw new PlanError(`${member.dir}: no overlay for ${kind}/${provider}`)
    }
    overlays.push(overlay)
  }
  return overlays
}

function providersFor(catalog: Catalog, packages: PackagePlan[]): LoadedProvider[] {
  const found = new Map<string, LoadedProvider>()
  for (const pkg of packages) {
    for (const overlay of pkg.overlays) {
      const key = `${overlay.kind}/${overlay.provider}`
      const provider = catalog.providers.get(key)
      if (provider === undefined) throw new PlanError(`${pkg.dir}: unknown provider ${key}`)
      found.set(key, provider)
    }
  }
  return [...found.values()].sort(
    (a, b) =>
      CAPABILITY_KINDS.indexOf(a.kind) - CAPABILITY_KINDS.indexOf(b.kind) ||
      a.id.localeCompare(b.id),
  )
}

export function resolveRequest(catalog: Catalog, input: RequestInput): GenerationPlan {
  const { members: declared, stackId } = resolveMembers(catalog, input)
  const members = orderForContract(declared)

  const answerPackages = input.answers?.packages ?? {}
  for (const dir of Object.keys(answerPackages)) {
    if (!members.some((m) => m.dir === dir)) {
      throw new PlanError(`answers name package ${dir}, which is not in the plan`)
    }
  }

  const servers = members.filter((m) => m.template.manifest.kind === 'server')
  if (servers.length > 1) {
    throw new PlanError(
      `a stack takes one server package, found ${servers.map((m) => m.dir).join(' and ')}`,
    )
  }
  const server = servers[0]
  const frontend = members.find((m) => m.template.manifest.kind === 'frontend')
  const deploy = resolveDeploy(input.deploy ?? input.answers?.deploy, server, frontend)

  const shorthand = routeShorthandFlags(members, input.flags)
  const shorthandCapabilities = routeShorthandCapabilities(members, input.capabilities)
  const packages = members.map((member): PackagePlan => {
    const specs = member.template.manifest.flags ?? {}
    const flags: Record<string, boolean> = {}
    for (const [name, spec] of Object.entries(specs)) flags[name] = spec.default
    const answered = answerPackages[member.dir]?.flags ?? {}
    for (const [name, value] of Object.entries(answered)) {
      if (specs[name] === undefined) throw new PlanError(`unknown flag for ${member.dir}: ${name}`)
      flags[name] = value
    }
    Object.assign(flags, shorthand.get(member.dir))
    const capabilities: Record<string, string> = {}
    for (const [kind, provider] of Object.entries(answerPackages[member.dir]?.capabilities ?? {})) {
      assertListed(member, kind, provider)
      capabilities[kind] = provider
    }
    Object.assign(capabilities, shorthandCapabilities.get(member.dir))
    const overlays = overlaysFor(member, capabilities)
    const consumer =
      member.template.manifest.contract !== undefined &&
      'consumes' in member.template.manifest.contract
    return {
      dir: member.dir,
      template: member.template,
      flags,
      capabilities,
      overlays,
      commands: Object.assign(
        {},
        member.template.manifest.commands,
        ...overlays.map((overlay) => overlay.manifest.commands),
      ) as PackagePlan['commands'],
      selections: selectionsFor(
        member.template,
        flags,
        server !== undefined,
        deploy === 'single',
        capabilities,
      ),
      serverDir: server?.dir ?? null,
      serverPort: server?.template.manifest.http?.port ?? null,
      frontendDir: frontend?.dir ?? null,
      serverDevCommand: null,
      contractSkipped: consumer && server === undefined,
    }
  })

  // The server's commands include its capabilities', so they are known only once every package is.
  const serverDevCommand = packages.find((pkg) => pkg.dir === server?.dir)?.commands.dev ?? null
  for (const pkg of packages) pkg.serverDevCommand = serverDevCommand

  const providers = providersFor(catalog, packages)
  // The provider's service and a package would be one Compose service: the provider would be
  // dropped and the package would depend on itself.
  for (const provider of providers) {
    const clash = packages.find((pkg) => pkg.dir === provider.manifest.service)
    if (clash !== undefined) {
      throw new PlanError(
        `package dir "${clash.dir}" is the Compose service name of provider ${provider.kind}/${provider.id}; choose another dir`,
      )
    }
  }

  // The derived one-shot service is a Compose service of its own; a package or a provider with
  // the same name would be replaced by it.
  for (const pkg of packages) {
    if (!pkg.overlays.some((overlay) => overlay.manifest.container !== undefined)) continue
    const derived = migrateServiceName(pkg.dir)
    const packageClash = packages.find((other) => other.dir === derived)
    if (packageClash !== undefined) {
      throw new PlanError(
        `package dir "${derived}" is the Compose service name derived for the migration of "${pkg.dir}"; choose another dir`,
      )
    }
    const providerClash = providers.find((provider) => provider.manifest.service === derived)
    if (providerClash !== undefined) {
      throw new PlanError(
        `derived migrate service "${derived}" is the Compose service name of provider ${providerClash.kind}/${providerClash.id}`,
      )
    }
  }

  return {
    out: input.out,
    projectName: toProjectName(input.answers?.projectName ?? input.name),
    stackId,
    packages,
    providers,
    catalogVersion: input.catalogVersion,
    skipPostGenerate: input.skipPostGenerate,
    deploy,
  }
}
