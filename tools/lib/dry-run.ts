import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { LoadedOverlay, LoadedTemplate } from './catalog'
import { listFiles } from './files'
import { applyMarkers, commentSyntaxFor, findLeftoverMarker, MarkerError } from './markers'
import { isTextFile } from './placeholders'
import { SERVER_SELECTION, SINGLE_SELECTION, selectionsFor } from './plan'

// Every choice of providers: for each declared kind, none or one listed provider.
function capabilityCombinations(template: LoadedTemplate): Record<string, string>[] {
  let combinations: Record<string, string>[] = [{}]
  for (const [kind, spec] of Object.entries(template.manifest.capabilities ?? {})) {
    combinations = combinations.flatMap((chosen) => [
      chosen,
      ...spec.providers.map((provider) => ({ ...chosen, [kind]: provider })),
    ])
  }
  return combinations
}

function relative(from: string, file: string): string {
  return path.relative(from, file).split(path.sep).join('/')
}

// What a generation with these overlays would apply markers to: compose.yaml, each overlay's
// files, and the base files no overlay replaces (same relative path).
function filesFor(template: LoadedTemplate, overlays: LoadedOverlay[]): string[] {
  const base = path.join(template.dir, 'base')
  const replaced = new Set(
    overlays.flatMap((overlay) =>
      listFiles(overlay.overlayDir).map((file) => relative(overlay.overlayDir, file)),
    ),
  )
  const kept = listFiles(base).filter((file) => !replaced.has(relative(base, file)))
  const added = overlays.flatMap((overlay) => listFiles(overlay.overlayDir))
  return [...kept, ...added, path.join(template.dir, 'compose.yaml')]
    .filter((file) => isTextFile(file) && commentSyntaxFor(file) !== undefined)
    .filter((file) => existsSync(file)) // compose.yaml is optional
}

export function dryRunMarkers(template: LoadedTemplate): string[] {
  // The reserved selections vary like flags: the plan may or may not hold a server, and with one
  // it may deploy as a single image.
  const flagNames = [
    ...Object.keys(template.manifest.flags ?? {}),
    SERVER_SELECTION,
    SINGLE_SELECTION,
  ]
  const contents = new Map<string, string>()
  const read = (file: string) => {
    let content = contents.get(file)
    if (content === undefined) {
      content = readFileSync(file, 'utf8')
      contents.set(file, content)
    }
    return content
  }

  const problems = new Set<string>()
  for (const capabilities of capabilityCombinations(template)) {
    const overlays = Object.entries(capabilities).flatMap(([kind, provider]) => {
      const overlay = template.overlays.get(`${kind}/${provider}`)
      return overlay === undefined ? [] : [overlay]
    })
    const files = filesFor(template, overlays)

    for (let mask = 0; mask < 2 ** flagNames.length; mask++) {
      const switches: Record<string, boolean> = {}
      flagNames.forEach((name, index) => (switches[name] = (mask & (1 << index)) !== 0))
      const hasServer = switches[SERVER_SELECTION] === true
      const single = switches[SINGLE_SELECTION] === true
      // Single without a server cannot happen, and selectionsFor would make it split again.
      if (single && !hasServer) continue
      delete switches[SERVER_SELECTION]
      delete switches[SINGLE_SELECTION]
      const selections = selectionsFor(template, switches, hasServer, single, capabilities)

      for (const file of files) {
        const where = relative(template.dir, file)
        const syntax = commentSyntaxFor(file)
        if (syntax === undefined) continue
        try {
          const output = applyMarkers(read(file), syntax, where, selections)
          const leftover = findLeftoverMarker(output, syntax)
          if (leftover !== null) problems.add(`${where}: leftover marker ${leftover}`)
        } catch (error) {
          if (!(error instanceof MarkerError)) throw error
          problems.add(error.message)
        }
      }
    }
  }
  return [...problems]
}
