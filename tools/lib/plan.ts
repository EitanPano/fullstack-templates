import { DEFAULT_DIR_BY_KIND, type Catalog, type LoadedTemplate } from './catalog'
import { toProjectName } from './placeholders'

export interface Answers {
  projectName?: string
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
}

export interface PackagePlan {
  dir: string
  template: LoadedTemplate
  flags: Record<string, boolean>
  capabilities: Record<string, string>
  selections: Record<string, boolean>
  serverDir: string | null
  serverPort: number | null
  contractSkipped: boolean
}

export interface GenerationPlan {
  out: string
  projectName: string
  stackId: string | null
  packages: PackagePlan[]
  catalogVersion: string | undefined
  skipPostGenerate: boolean
}

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

function buildSelections(member: Member, flags: Record<string, boolean>): Record<string, boolean> {
  const selections: Record<string, boolean> = { ...flags }
  for (const kind of Object.keys(member.template.manifest.capabilities ?? {})) {
    selections[kind] = false
  }
  return selections
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

  const hasCapability =
    input.capabilities.length > 0 ||
    Object.values(answerPackages).some((p) => Object.keys(p.capabilities ?? {}).length > 0)
  if (hasCapability) {
    for (const entry of input.capabilities) parsePair(entry, 'a capability')
    throw new PlanError('no provider overlays exist in this catalog yet')
  }

  const servers = members.filter((m) => m.template.manifest.kind === 'server')
  if (servers.length > 1) {
    throw new PlanError(
      `a stack takes one server package, found ${servers.map((m) => m.dir).join(' and ')}`,
    )
  }
  const server = servers[0]

  const shorthand = routeShorthandFlags(members, input.flags)
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
    const consumer =
      member.template.manifest.contract !== undefined &&
      'consumes' in member.template.manifest.contract
    return {
      dir: member.dir,
      template: member.template,
      flags,
      capabilities: {},
      selections: buildSelections(member, flags),
      serverDir: server?.dir ?? null,
      serverPort: server?.template.manifest.http?.port ?? null,
      contractSkipped: consumer && server === undefined,
    }
  })

  return {
    out: input.out,
    projectName: toProjectName(input.answers?.projectName ?? input.name),
    stackId,
    packages,
    catalogVersion: input.catalogVersion,
    skipPostGenerate: input.skipPostGenerate,
  }
}
