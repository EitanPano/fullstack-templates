import { Document, Scalar, YAMLMap, isMap, isNode, parseDocument } from 'yaml'

export class ComposeError extends Error {}

export function composeServices(text: string): Set<string> {
  const services = parseDocument(text).get('services')
  return new Set(isMap(services) ? services.items.map((pair) => String(pair.key)) : [])
}

export function assembleCompose(
  skeleton: string,
  fragments: ReadonlyArray<{ service: string; text: string }>,
): string {
  const doc = parseDocument(skeleton)
  // yaml reports syntax errors on the document instead of throwing, and would emit a repaired file.
  if (doc.errors.length > 0) {
    throw new ComposeError(`Compose skeleton is not valid YAML: ${doc.errors[0]?.message}`)
  }
  // An empty `services: {}` is a flow map, which would force every fragment into flow style.
  const services = doc.get('services')
  if (isMap(services)) services.flow = false
  const seen = new Set<string>()
  for (const { service, text } of fragments) {
    if (seen.has(service)) {
      throw new ComposeError(`Compose service "${service}" is defined by more than one fragment`)
    }
    seen.add(service)
    const fragment = parseDocument(text)
    if (fragment.errors.length > 0) {
      throw new ComposeError(
        `Compose fragment for service "${service}" is not valid YAML: ${fragment.errors[0]?.message}`,
      )
    }
    if (!isMap(fragment.contents)) {
      throw new ComposeError(`Compose fragment for service "${service}" is not a YAML mapping`)
    }
    doc.setIn(['services', service], fragment.contents)
  }
  return doc.toString()
}

export interface ProviderEnvWiring {
  service: string
  env: ReadonlyArray<{ name: string; compose: string; secret?: boolean }>
}

function parseChecked(text: string, what: string): Document {
  const doc = parseDocument(text)
  if (doc.errors.length > 0) {
    throw new ComposeError(`${what} is not valid YAML: ${doc.errors[0]?.message}`)
  }
  return doc
}

// The consumer reaches the provider by its service name, so it gets the compose-network value
// (overridable from the shell) and waits for the provider's healthcheck. A secret entry gets no
// default: its value comes from the shell, so the bundled credentials never reach production.
export function wireConsumer(
  service: string,
  text: string,
  wirings: ReadonlyArray<ProviderEnvWiring>,
): string {
  const doc = parseChecked(text, `Compose fragment for service "${service}"`)
  if (!isMap(doc.contents)) {
    throw new ComposeError(`Compose fragment for service "${service}" is not a YAML mapping`)
  }
  for (const key of ['environment', 'depends_on']) {
    const current = doc.get(key)
    if (current !== undefined && current !== null && !isMap(current)) {
      throw new ComposeError(
        `Compose fragment for service "${service}": ${key} must be a mapping, not a list`,
      )
    }
  }
  for (const { service: provider, env } of wirings) {
    for (const { name, compose, secret } of env) {
      // `${NAME-}`: empty when unset, so Compose does not warn on `up -d database`; the server
      // still refuses an empty value in production.
      const value = secret === true ? `\${${name}-}` : `\${${name}:-${compose}}`
      doc.setIn(['environment', name], value)
    }
    doc.setIn(['depends_on', provider], { condition: 'service_healthy' })
  }
  return doc.toString()
}

export function migrateServiceName(service: string): string {
  return `${service}-migrate`
}

// A one-shot copy of the package service: same image build and the same wired environment, run
// with the migrate command once the provider is healthy. The package then waits for it to finish,
// so the server never starts against a schema that is behind. It publishes no port and has no
// restart policy, because a migration that fails must stay failed.
export function deriveMigrate(
  service: string,
  text: string,
  command: string,
  providerService: string,
): { consumer: string; migrate: string } {
  const doc = parseChecked(text, `Compose fragment for service "${service}"`)
  if (!isMap(doc.contents)) {
    throw new ComposeError(`Compose fragment for service "${service}" is not a YAML mapping`)
  }
  const dependsOn = doc.get('depends_on')
  if (dependsOn !== undefined && dependsOn !== null && !isMap(dependsOn)) {
    throw new ComposeError(
      `Compose fragment for service "${service}": depends_on must be a mapping, not a list`,
    )
  }
  const derived = new Document(new YAMLMap())
  for (const key of ['build', 'environment']) {
    const node = doc.get(key, true)
    if (isNode(node)) derived.set(key, node.clone())
  }
  derived.set('command', command)
  // Quoted, because an unquoted no is a boolean to a YAML 1.1 reader.
  const restart = new Scalar('no')
  restart.type = Scalar.QUOTE_DOUBLE
  derived.set('restart', restart)
  derived.set('profiles', ['app'])
  derived.set('depends_on', { [providerService]: { condition: 'service_healthy' } })
  doc.setIn(['depends_on', migrateServiceName(service)], {
    condition: 'service_completed_successfully',
  })
  return { consumer: doc.toString(), migrate: derived.toString() }
}

const PROVIDER_KEYS = new Set(['services', 'volumes'])

// A rerun keeps what the project already has: the provider service (and with it its volumes)
// is only added when the document lacks it.
export function addProvider(
  composeText: string,
  service: string,
  providerText: string,
  log: (line: string) => void,
): string {
  const provider = parseChecked(providerText, `Compose document of provider service "${service}"`)
  if (!isMap(provider.contents)) {
    throw new ComposeError(`Compose document of provider service "${service}" is not a mapping`)
  }
  for (const pair of provider.contents.items) {
    if (!PROVIDER_KEYS.has(String(pair.key))) {
      throw new ComposeError(
        `Compose document of provider service "${service}" has top-level key ${String(pair.key)}; only services and volumes are allowed`,
      )
    }
  }
  const node = provider.getIn(['services', service], true)
  if (node === undefined) {
    throw new ComposeError(`Compose document of provider service "${service}" does not define it`)
  }
  const doc = parseChecked(composeText, 'docker-compose.yml')
  if (composeServices(composeText).has(service)) {
    log(`docker-compose.yml already has service ${service}; kept`)
    return composeText
  }
  const services = doc.get('services')
  if (isMap(services)) services.flow = false
  doc.setIn(['services', service], node)
  const volumes = provider.get('volumes', true)
  if (isMap(volumes)) {
    for (const pair of volumes.items) {
      if (!doc.hasIn(['volumes', String(pair.key)])) {
        doc.setIn(['volumes', String(pair.key)], pair.value)
      }
    }
  }
  return doc.toString()
}
