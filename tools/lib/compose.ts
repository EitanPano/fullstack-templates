import { isMap, parseDocument } from 'yaml'

export class ComposeError extends Error {}

export function assembleCompose(
  skeleton: string,
  fragments: ReadonlyArray<{ service: string; text: string }>,
): string {
  const doc = parseDocument(skeleton)
  // An empty `services: {}` is a flow map, which would force every fragment into flow style.
  const services = doc.get('services')
  if (isMap(services)) services.flow = false
  for (const { service, text } of fragments) {
    const fragment = parseDocument(text)
    if (!isMap(fragment.contents)) {
      throw new ComposeError(`Compose fragment for service "${service}" is not a YAML mapping`)
    }
    doc.setIn(['services', service], fragment.contents)
  }
  return doc.toString()
}
