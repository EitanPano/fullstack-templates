import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { LoadedTemplate } from './catalog'
import { listFiles } from './files'
import { applyMarkers, commentSyntaxFor, findLeftoverMarker, MarkerError } from './markers'
import { isTextFile } from './placeholders'

export function dryRunMarkers(template: LoadedTemplate): string[] {
  const flagNames = Object.keys(template.manifest.flags ?? {})
  const capabilityNames = Object.keys(template.manifest.capabilities ?? {})
  const compose = path.join(template.dir, 'compose.yaml')
  const files = [...listFiles(path.join(template.dir, 'base')), compose]
    .filter((file) => isTextFile(file) && commentSyntaxFor(file) !== undefined)
    .flatMap((file) => {
      try {
        return [{ file, content: readFileSync(file, 'utf8') }]
      } catch {
        return [] // compose.yaml is optional
      }
    })

  const problems = new Set<string>()
  for (let mask = 0; mask < 2 ** flagNames.length; mask++) {
    const selections: Record<string, boolean> = {}
    flagNames.forEach((name, index) => (selections[name] = (mask & (1 << index)) !== 0))
    // Capability kinds are always off in this milestone.
    for (const name of capabilityNames) selections[name] = false

    for (const { file, content } of files) {
      const where = path.relative(template.dir, file).split(path.sep).join('/')
      const syntax = commentSyntaxFor(file)
      if (syntax === undefined) continue
      try {
        const output = applyMarkers(content, syntax, where, selections)
        const leftover = findLeftoverMarker(output)
        if (leftover !== null) problems.add(`${where}: leftover marker ${leftover}`)
      } catch (error) {
        if (!(error instanceof MarkerError)) throw error
        problems.add(error.message)
      }
    }
  }
  return [...problems]
}
