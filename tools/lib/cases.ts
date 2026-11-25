import type { BrandInput } from './brand'
import type { Catalog, DeployMode, LoadedTemplate } from './catalog'
import { isApiKind, isSdkKind } from './package-dir'
import { parseFrontendArg, parseSdkArg, type RequestInput } from './plan'

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
  // The <dir>=<template> pairs replacing the stack's frontend (generate --frontend); empty keeps it.
  frontends: string[]
  // The <dir>=<template> of the plan's sdk package (generate --sdk); null without one. An sdk
  // template's own case adds the template itself at sdk-<id>.
  sdk: string | null
  // Flags and capabilities of further packages of the plan, by directory.
  packages: Record<
    string,
    { flags?: Record<string, boolean>; capabilities?: Record<string, string> }
  >
  // Runs the Compose smoke (build, boot, probe) when test-generated gets --with-app.
  withApp: boolean
  // The deploy mode the case asks for; null leaves the plan's default.
  deploy: DeployMode | null
  // The brand inputs the case generates with; null leaves the defaults.
  brand: BrandInput | null
}

// The stack's API package, a server or a serverless one.
function serverDirOf(catalog: Catalog, stack: string | undefined): string | null {
  const packages = stack === undefined ? [] : (catalog.stacks.get(stack)?.manifest.packages ?? [])
  const entry = packages.find((candidate) =>
    isApiKind(catalog.templates.get(candidate.template)?.manifest.kind ?? ''),
  )
  return entry?.dir ?? null
}

function listedDirs(frontends: string[] | undefined): string[] {
  return (frontends ?? []).map((entry) => parseFrontendArg(entry).dir)
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
      const sdkOwn = isSdkKind(template.manifest.kind)
      const stack = entry.stack ?? (sdkOwn ? template.manifest.defaultStack : undefined)
      if (sdkOwn && stack === undefined) {
        throw new Error(
          `case ${template.path}/${entry.name} names no stack and the template has no defaultStack`,
        )
      }
      cases.push({
        id: `${template.path}/${entry.name}`,
        template,
        name: entry.name,
        stack: stack ?? null,
        // A frontend case's own package is its first listed frontend; any other case's is its stack entry.
        packageDir: sdkOwn
          ? `sdk-${template.manifest.id}`
          : entry.stack
            ? ((template.manifest.kind === 'frontend'
                ? listedDirs(entry.frontends)[0]
                : undefined) ?? stackDir(catalog, entry.stack, template))
            : null,
        serverDir: isApiKind(template.manifest.kind) ? null : serverDirOf(catalog, stack),
        serverFlags: entry.server?.flags ?? {},
        serverCapabilities: entry.server?.capabilities ?? {},
        flags: entry.flags ?? {},
        capabilities: entry.capabilities ?? {},
        frontends: entry.frontends ?? [],
        sdk: sdkOwn ? `sdk-${template.manifest.id}=${template.path}` : (entry.sdk ?? null),
        packages: entry.packages ?? {},
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
    ...(c.frontends.length === 0 ? {} : { frontends: c.frontends.map(parseFrontendArg) }),
    ...(c.sdk === null ? {} : { sdks: [parseSdkArg(c.sdk)] }),
    flags: [],
    capabilities: [],
    answers: {
      ...(c.brand === null ? {} : { brand: c.brand }),
      packages: {
        ...c.packages,
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
