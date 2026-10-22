import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type {
  CapabilityManifest,
  LoadedOverlay,
  LoadedProvider,
  LoadedTemplate,
  ProviderManifest,
} from './catalog'
import { CAPABILITY_KINDS, isKind, type CapabilityKind } from './capability-kinds'
import { readChecked, subdirectories } from './read-checked'

const kindList = () => CAPABILITY_KINDS.join(', ')

// shared/providers/<kind>/<id>/provider.yaml; the directory names are the identity.
export function loadProviders(root: string, problems: string[]): Map<string, LoadedProvider> {
  const providers = new Map<string, LoadedProvider>()
  const base = path.join(root, 'shared', 'providers')
  for (const name of subdirectories(base)) {
    if (!isKind(name)) {
      problems.push(`shared/providers/${name}: not a capability kind (${kindList()})`)
      continue
    }
    const kind: CapabilityKind = name
    for (const id of subdirectories(path.join(base, kind))) {
      const rel = `shared/providers/${kind}/${id}`
      const dir = path.join(base, kind, id)
      const manifest = readChecked<ProviderManifest>(
        path.join(dir, 'provider.yaml'),
        `${rel}/provider.yaml`,
        'provider',
        problems,
      )
      if (!manifest) continue
      if (manifest.kind !== kind) {
        problems.push(`${rel}: kind "${manifest.kind}" differs from the directory "${kind}"`)
      }
      if (manifest.id !== id) {
        problems.push(`${rel}: id "${manifest.id}" differs from the directory "${id}"`)
      }
      if (!existsSync(path.join(dir, manifest.compose))) {
        problems.push(`${rel}: compose file ${manifest.compose} is missing`)
      }
      for (const file of manifest.files ?? []) {
        if (!existsSync(path.join(dir, file))) problems.push(`${rel}: file ${file} is missing`)
      }
      providers.set(`${kind}/${id}`, { kind, id, dir, manifest })
    }
  }
  return providers
}

// The scripts the template's own dependency manifest defines; an unreadable manifest is a problem.
function templateScripts(template: LoadedTemplate, problems: string[]): Set<string> {
  const spec = template.manifest.dependencies
  if (!spec) return new Set()
  const file = path.join(template.dir, 'base', spec.manifest)
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const scripts =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { scripts?: unknown }).scripts
        : undefined
    return new Set(typeof scripts === 'object' && scripts !== null ? Object.keys(scripts) : [])
  } catch {
    problems.push(`${template.path}: base/${spec.manifest} is not readable JSON`)
    return new Set()
  }
}

function checkOverlayManifest(
  template: LoadedTemplate,
  manifest: CapabilityManifest,
  overlayDir: string,
  label: string,
  problems: string[],
): void {
  for (const name of Object.keys(manifest.commands ?? {})) {
    if (name in template.manifest.commands) {
      problems.push(
        `${label}/capability.yaml: command "${name}" is already defined by the template`,
      )
    }
  }
  for (const [flag, spec] of Object.entries(manifest.flags ?? {})) {
    if (!(flag in (template.manifest.flags ?? {}))) {
      problems.push(`${label}/capability.yaml: flag "${flag}" is not declared by the template`)
      continue
    }
    for (const only of spec.onlyPaths) {
      if (!existsSync(path.join(overlayDir, only))) {
        problems.push(
          `${label}/capability.yaml: flag "${flag}" onlyPath "${only}" does not exist in overlay/`,
        )
      }
    }
  }
  const scriptNames = Object.keys(manifest.scripts ?? {})
  const adapter = template.manifest.dependencies
  if (!adapter) {
    if (scriptNames.length > 0 || manifest.dependencies) {
      problems.push(
        `${label}/capability.yaml: scripts or dependencies need a template with a dependencies adapter`,
      )
    }
    return
  }
  if (scriptNames.length === 0) return
  const existing = templateScripts(template, problems)
  for (const name of scriptNames) {
    if (existing.has(name)) {
      problems.push(
        `${label}/capability.yaml: script "${name}" is already defined by base/${adapter.manifest}`,
      )
    }
  }
}

// One overlay per provider the template lists under capabilities.<kind>.providers.
export function loadOverlays(
  template: LoadedTemplate,
  providers: Map<string, LoadedProvider>,
  problems: string[],
): Map<string, LoadedOverlay> {
  const overlays = new Map<string, LoadedOverlay>()
  for (const kind of CAPABILITY_KINDS) {
    for (const provider of template.manifest.capabilities?.[kind]?.providers ?? []) {
      const label = `${template.path}/capabilities/${kind}/${provider}`
      if (!providers.has(`${kind}/${provider}`)) {
        problems.push(`${label}: provider ${kind}/${provider} is not in shared/providers`)
      }
      const dir = path.join(template.dir, 'capabilities', kind, provider)
      if (!existsSync(dir)) {
        problems.push(`${label}: directory is missing`)
        continue
      }
      const overlayDir = path.join(dir, 'overlay')
      if (!existsSync(overlayDir)) problems.push(`${label}: overlay/ is missing`)
      const manifest = readChecked<CapabilityManifest>(
        path.join(dir, 'capability.yaml'),
        `${label}/capability.yaml`,
        'capability',
        problems,
      )
      if (!manifest) continue
      if (manifest.kind !== kind) {
        problems.push(`${label}: kind "${manifest.kind}" differs from the path`)
      }
      if (manifest.provider !== provider) {
        problems.push(`${label}: provider "${manifest.provider}" differs from the path`)
      }
      checkOverlayManifest(template, manifest, overlayDir, label, problems)
      overlays.set(`${kind}/${provider}`, { kind, provider, dir, overlayDir, manifest })
    }
  }
  return overlays
}

// A directory under capabilities/ that the template does not list is dead weight.
export function checkUnlistedCapabilities(template: LoadedTemplate, problems: string[]): void {
  const base = path.join(template.dir, 'capabilities')
  for (const kind of subdirectories(base)) {
    const rel = `${template.path}/capabilities/${kind}`
    if (!isKind(kind)) {
      problems.push(`${rel}: not a capability kind (${kindList()})`)
      continue
    }
    const listed = template.manifest.capabilities?.[kind]?.providers ?? []
    for (const provider of subdirectories(path.join(base, kind))) {
      if (!listed.includes(provider)) {
        problems.push(`${rel}/${provider}: not listed in template.yaml capabilities`)
      }
    }
  }
}

// A provider ships with its first overlay; one that no template lists is dead weight.
export function checkProvidersUsed(
  providers: Map<string, LoadedProvider>,
  templates: Map<string, LoadedTemplate>,
  problems: string[],
): void {
  const used = new Set<string>()
  for (const { manifest } of templates.values()) {
    for (const kind of CAPABILITY_KINDS) {
      for (const id of manifest.capabilities?.[kind]?.providers ?? []) used.add(`${kind}/${id}`)
    }
  }
  for (const key of providers.keys()) {
    if (!used.has(key)) problems.push(`shared/providers/${key}: no template lists this provider`)
  }
}

// Every case capability must be declared; every listed provider needs a case alone at the default
// flags and a case with every flag off, so no provider ships without both extremes tested.
export function checkCapabilityCases(template: LoadedTemplate, problems: string[]): void {
  const { cases } = template.cases
  const { flags = {}, capabilities = {} } = template.manifest
  for (const testCase of cases) {
    for (const [kind, provider] of Object.entries(testCase.capabilities ?? {})) {
      const spec = isKind(kind) ? capabilities[kind] : undefined
      if (!spec) {
        problems.push(
          `${template.path}: case "${testCase.name}" uses undeclared capability "${kind}"`,
        )
      } else if (!spec.providers.includes(provider)) {
        problems.push(
          `${template.path}: case "${testCase.name}" uses unlisted provider "${provider}" for ${kind}`,
        )
      }
    }
  }
  for (const kind of CAPABILITY_KINDS) {
    for (const provider of capabilities[kind]?.providers ?? []) {
      const withProvider = cases.filter((testCase) => testCase.capabilities?.[kind] === provider)
      const atDefaults = withProvider.some(
        (testCase) =>
          Object.keys(testCase.capabilities ?? {}).length === 1 &&
          Object.entries(testCase.flags ?? {}).every(
            ([name, value]) => value === flags[name]?.default,
          ),
      )
      if (!atDefaults) {
        problems.push(
          `${template.path}: no case selects only ${kind}=${provider} with the default flags`,
        )
      }
      const allOff = withProvider.some((testCase) =>
        Object.keys(flags).every((name) => testCase.flags?.[name] === false),
      )
      if (!allOff) {
        problems.push(`${template.path}: no case selects ${kind}=${provider} with every flag false`)
      }
    }
  }
}
