import { closeSync, openSync, readFileSync, readSync } from 'node:fs'
import { findLeftoverMarker } from './markers'
import { findLeftoverPlaceholder, isTextFile } from './placeholders'

const PROBE_BYTES = 1024

// A NUL byte in the first KiB is how git and the pins module tell binary from text.
export function looksLikeText(file: string): boolean {
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(PROBE_BYTES)
    const read = readSync(fd, buffer, 0, PROBE_BYTES, 0)
    return !buffer.subarray(0, read).includes(0)
  } finally {
    closeSync(fd)
  }
}

// A file of a type neither markers.ts nor placeholders.ts lists is copied untouched, so a marker
// or a declared placeholder in it would ship as written. Returns what it found, or null.
export function findUnprocessed(file: string, names: readonly string[]): string | null {
  if (isTextFile(file) || !looksLikeText(file)) return null
  const content = readFileSync(file, 'utf8')
  const marker = findLeftoverMarker(content)
  if (marker !== null) return `marker ${marker}`
  const token = findLeftoverPlaceholder(content, names)
  return token === null ? null : `placeholder ${token}`
}

export const UNPROCESSED_HINT =
  'its type is in neither markers.ts nor placeholders.ts, so the generator leaves it as written; list the type or remove the text'
