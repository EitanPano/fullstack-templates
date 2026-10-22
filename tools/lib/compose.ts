import { isMap, parseDocument } from 'yaml'

export class ComposeError extends Error {}

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
