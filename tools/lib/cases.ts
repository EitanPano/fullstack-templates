import type { BrandInput } from './brand'
import type { Catalog, DeployMode, LoadedTemplate } from './catalog'
import type { RequestInput } from './plan'

export interface GenerationCase {
  id: string
  template: LoadedTemplate
  name: string
  stack: string | null
  // The directory the stack gives this case's template; null for a template case.
  packageDir: string | null
  // A frontend case: the directory of its stack's server package (null without a stack or a
  // server) and the flags and capabilities the case sets on that server.
  serverDir: string | null
  serverFlags: Record<string, boolean>
  serverCapabilities: Record<string, string>
  flags: Record<string, boolean>
  capabilities: Record<string, string>
  // Runs the Compose smoke (build, boot, probe) when test-generated gets --with-app.
  withApp: boolean
  // The deploy mode the case asks for; null leaves the plan's default.
  deploy: DeployMode | null
  // The brand inputs the case generates with; null leaves the defaults.
  brand: BrandInput | null
}

function serverDirOf(catalog: Catalog, stack: string | undefined): string | null {
  const packages = stack === undefined ? [] : (catalog.stacks.get(stack)?.manifest.packages ?? [])
  const entry = packages.find(
    (candidate) => catalog.templates.get(candidate.template)?.manifest.kind === 'server',
  )
  return entry?.dir ?? null
}

function stackDir(catalog: Catalog, stack: string, template: LoadedTemplate): string {
  const entry = catalog.stacks
    .get(stack)
    ?.manifest.packages.find((candidate) => candidate.template === template.path)
  if (!entry) throw new Error(`case stack ${stack} has no package for template ${template.path}`)
  return entry.dir
}

export function listCases(catalog: Catalog): GenerationCase[] {
  const cases: GenerationCase[] = []
  for (const template of catalog.templates.values()) {
    for (const entry of template.cases.cases) {
      cases.push({
        id: `${template.path}/${entry.name}`,
        template,
        name: entry.name,
        stack: entry.stack ?? null,
        packageDir: entry.stack ? stackDir(catalog, entry.stack, template) : null,
        serverDir: template.manifest.kind === 'server' ? null : serverDirOf(catalog, entry.stack),
        serverFlags: entry.server?.flags ?? {},
        serverCapabilities: entry.server?.capabilities ?? {},
        flags: entry.flags ?? {},
        capabilities: entry.capabilities ?? {},
        withApp: entry.withApp === true,
        deploy: entry.deploy ?? null,
        brand: entry.brand ?? null,
      })
    }
  }
  return cases.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function requestFor(c: GenerationCase, out: string): RequestInput {
  const base = {
    out,
    name: 'demo',
    skipPostGenerate: false,
    ...(c.deploy === null ? {} : { deploy: c.deploy }),
  }
  if (c.stack === null || c.packageDir === null) {
    return {
      ...base,
      template: c.template.path,
      ...(c.brand === null ? {} : { answers: { brand: c.brand } }),
      flags: Object.entries(c.flags).map(([k, v]) => `${k}=${v}`),
      capabilities: Object.entries(c.capabilities).map(([k, v]) => `${k}=${v}`),
    }
  }
  return {
    ...base,
    stack: c.stack,
    flags: [],
    capabilities: [],
    answers: {
      ...(c.brand === null ? {} : { brand: c.brand }),
      packages: {
        [c.packageDir]: { flags: c.flags, capabilities: c.capabilities },
        // Only a case that sets the server adds its entry, so other answers stay as they were.
        ...(c.serverDir !== null &&
        (Object.keys(c.serverFlags).length > 0 || Object.keys(c.serverCapabilities).length > 0)
          ? { [c.serverDir]: { flags: c.serverFlags, capabilities: c.serverCapabilities } }
          : {}),
      },
    },
  }
}
