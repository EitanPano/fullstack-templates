import type { Catalog, DeployMode, LoadedTemplate } from './catalog'
import type { RequestInput } from './plan'

export interface GenerationCase {
  id: string
  template: LoadedTemplate
  name: string
  stack: string | null
  // The directory the stack gives this case's template; null for a template case.
  packageDir: string | null
  flags: Record<string, boolean>
  capabilities: Record<string, string>
  // Runs the Compose smoke (build, boot, probe) when test-generated gets --with-app.
  withApp: boolean
  // The deploy mode the case asks for; null leaves the plan's default.
  deploy: DeployMode | null
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
        flags: entry.flags ?? {},
        capabilities: entry.capabilities ?? {},
        withApp: entry.withApp === true,
        deploy: entry.deploy ?? null,
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
      packages: { [c.packageDir]: { flags: c.flags, capabilities: c.capabilities } },
    },
  }
}
