import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMap, parseDocument } from 'yaml'
import type { Catalog, LoadedOverlay, LoadedTemplate } from './catalog'
import { listFiles } from './files'

export class PinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PinError'
  }
}

const CR_LF = Buffer.from('\r\n')

function normaliseLineEndings(content: Buffer): Buffer {
  if (content.includes(0)) return content // binary: git stores it as is
  const parts: Buffer[] = []
  let from = 0
  for (let at = content.indexOf(CR_LF, from); at !== -1; at = content.indexOf(CR_LF, from)) {
    parts.push(content.subarray(from, at), Buffer.from('\n'))
    from = at + CR_LF.length
  }
  parts.push(content.subarray(from))
  return Buffer.concat(parts)
}

// Git's blob id of the content with CRLF read as LF. The repository's .gitattributes stores text
// with LF, so on any checkout this equals the id git holds for the file.
export function blobId(content: string | Uint8Array): string {
  const bytes = normaliseLineEndings(Buffer.from(content))
  return createHash('sha1')
    .update(`blob ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex')
}

function relative(from: string, file: string): string {
  return path.relative(from, file).split(path.sep).join('/')
}

// The overlay files that replace a base file. Files only the overlay has add to the package, and
// a flag's onlyPaths are removed again, so neither can drift from a base file.
export function shadowedPaths(template: LoadedTemplate, overlay: LoadedOverlay): string[] {
  const base = path.join(template.dir, 'base')
  const flagOnly = new Set(
    Object.values(overlay.manifest.flags ?? {}).flatMap((flag) => flag.onlyPaths),
  )
  return listFiles(overlay.overlayDir)
    .map((file) => relative(overlay.overlayDir, file))
    .filter((file) => !flagOnly.has(file) && existsSync(path.join(base, file)))
    .sort()
}

function baseBlob(template: LoadedTemplate, file: string): string {
  return blobId(readFileSync(path.join(template.dir, 'base', file)))
}

export function capabilityTarget(template: LoadedTemplate, overlay: LoadedOverlay): string {
  return `${template.path}/${overlay.kind}/${overlay.provider}`
}

export function checkPins(catalog: Catalog): string[] {
  const problems: string[] = []
  for (const template of catalog.templates.values()) {
    for (const overlay of template.overlays.values()) {
      const label = `${template.path}/capabilities/${overlay.kind}/${overlay.provider}`
      const pins = overlay.manifest.pins ?? {}
      const shadowed = shadowedPaths(template, overlay)
      for (const file of shadowed) {
        const pinned = pins[file]
        if (pinned === undefined) {
          problems.push(
            `${label}: ${file} shadows a base file and has no pin; run bun tools/validate.ts --pin ${capabilityTarget(template, overlay)}`,
          )
        } else if (pinned !== baseBlob(template, file)) {
          problems.push(
            `${label}: ${file} base changed since the overlay was reconciled; review the overlay, then run \`bun tools/validate.ts --pin ${capabilityTarget(template, overlay)}\``,
          )
        }
      }
      for (const file of Object.keys(pins)) {
        if (!shadowed.includes(file)) {
          problems.push(`${label}: pin for ${file}, which is not shadowed by the overlay`)
        }
      }
    }
  }
  return problems
}

function git(cwd: string, args: string[], input?: string): { status: number | null; out: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', input })
  return { status: result.status, out: result.stdout }
}

function findOverlay(
  catalog: Catalog,
  target: string,
): { template: LoadedTemplate; overlay: LoadedOverlay } {
  const known: string[] = []
  for (const template of catalog.templates.values()) {
    for (const overlay of template.overlays.values()) {
      if (capabilityTarget(template, overlay) === target) return { template, overlay }
      known.push(capabilityTarget(template, overlay))
    }
  }
  const list = known.length === 0 ? 'none' : known.sort().join(', ')
  throw new PinError(`unknown capability "${target}"; known: ${list}`)
}

// Prints what changed in a base file between two pins, so the reviewer sees what to reconcile.
// The new blob is written to the object database first: it may not be committed yet.
function printDiff(
  root: string,
  template: LoadedTemplate,
  file: string,
  before: string,
  log: (line: string) => void,
): void {
  if (git(root, ['cat-file', '-e', before]).status !== 0) {
    log(`${file}: the old blob ${before} is not in history; no diff to show`)
    return
  }
  const content = readFileSync(path.join(template.dir, 'base', file), 'utf8')
  const after = git(root, ['hash-object', '-w', '--stdin'], content.replaceAll('\r\n', '\n')).out
  log(`${file}: git diff ${before} ${after.trim()}`)
  log(git(root, ['diff', before, after.trim()]).out.trimEnd())
}

// Rewrites only the pins map of the capability's capability.yaml; the rest of the document,
// comments included, stays as it was.
export function pinCapability(catalog: Catalog, target: string, log: (line: string) => void): void {
  const { template, overlay } = findOverlay(catalog, target)
  const file = path.join(overlay.dir, 'capability.yaml')
  const doc = parseDocument(readFileSync(file, 'utf8'))
  const pins: Record<string, string> = {}
  for (const shadowed of shadowedPaths(template, overlay)) {
    pins[shadowed] = baseBlob(template, shadowed)
  }
  const old = overlay.manifest.pins ?? {}
  if (Object.keys(pins).length === 0) doc.delete('pins')
  else if (isMap(doc.get('pins'))) doc.set('pins', doc.createNode(pins))
  else doc.set('pins', pins)
  // No re-wrapping and no padded flow collections: the diff stays the pins and nothing else.
  writeFileSync(file, doc.toString({ lineWidth: 0, flowCollectionPadding: false }))
  for (const [shadowed, id] of Object.entries(pins)) {
    const before = old[shadowed]
    if (before === undefined || before === id) continue
    printDiff(catalog.root, template, shadowed, before, log)
  }
  log(`pinned ${String(Object.keys(pins).length)} file(s) for ${target}`)
}
