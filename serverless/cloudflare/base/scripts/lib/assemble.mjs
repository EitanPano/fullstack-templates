// assemble (lib) belongs: building the one folder Pages serves, `dist/`: the frontend's built
// output (when the plan has a frontend), then pages/'s files laid over it, then the build's
// policy checked and the fixed Content-Security-Policy line written into dist/_headers
// (csp-headers.mjs). It builds beside dist and swaps it in, so a failed run leaves the previous
// dist as it was. It never rewrites a page.
// It does not belong: building the frontend (its own command) or running wrangler (start.mjs).
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { CspError, applyPolicy, checkHeadersSource } from './csp-headers.mjs'

export class AssembleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssembleError'
  }
}

// _headers and _redirects are merged, the frontend's lines first; every other file of pages/
// (_routes.json) replaces the frontend's.
const MERGED = new Set(['_headers', '_redirects'])

const SHOWN = 10

// The files under `dir`, relative to it. A symbolic link is refused, whatever it points at: the
// walk reads each entry's own type (never follows a link), so a link cannot pull in a file from
// outside the build.
function files(dir, label) {
  if (lstatSync(dir).isSymbolicLink()) {
    throw new AssembleError(`${label} is a symbolic link; it must be a real folder`)
  }
  return walk(dir, '', label)
}

function walk(root, prefix, label) {
  return readdirSync(path.join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name)
    if (entry.isSymbolicLink()) {
      throw new AssembleError(
        `${label} holds a symbolic link (${relative.replaceAll('\\', '/')}); copy the file instead`,
      )
    }
    return entry.isDirectory() ? walk(root, relative, label) : [relative]
  })
}

function listWithout(without) {
  const shown = without.slice(0, SHOWN).join(', ')
  const more = without.length > SHOWN ? ` (and ${String(without.length - SHOWN)} more)` : ''
  const count = `${String(without.length)} page${without.length === 1 ? '' : 's'}`
  return `${count} served without a script policy: ${shown}${more}`
}

// `frontend` is the frontend's built output directory, or null when the plan has none. `warn`
// receives the one warning about pages that have no policy meta.
export function assemble({
  pages,
  dist,
  frontend,
  warn = (message) => {
    process.stderr.write(`assemble: warning: ${message}\n`)
  },
}) {
  if (!existsSync(pages)) throw new AssembleError(`${pages} is missing: it holds _routes.json`)
  if (frontend !== null && (!existsSync(frontend) || readdirSync(frontend).length === 0)) {
    throw new AssembleError(
      `the frontend's output ${frontend} is missing or empty: build the frontend first`,
    )
  }
  const work = `${dist}.assembling`
  rmSync(work, { recursive: true, force: true })
  try {
    const own = files(pages, 'pages/')
    if (frontend !== null) {
      files(frontend, "the frontend's output")
      const theirs = path.join(frontend, '_headers')
      if (existsSync(theirs)) {
        checkHeadersSource(readFileSync(theirs, 'utf8'), "the frontend's _headers")
      }
    }
    const ours = path.join(pages, '_headers')
    if (existsSync(ours)) checkHeadersSource(readFileSync(ours, 'utf8'), 'pages/_headers')

    mkdirSync(work, { recursive: true })
    if (frontend !== null) cpSync(frontend, work, { recursive: true })
    for (const relative of own) {
      const from = path.join(pages, relative)
      const to = path.join(work, relative)
      mkdirSync(path.dirname(to), { recursive: true })
      if (MERGED.has(relative) && existsSync(to)) {
        const theirs = readFileSync(to, 'utf8').replace(/\s+$/, '')
        const mine = readFileSync(from, 'utf8').replace(/^\s+/, '')
        writeFileSync(to, `${theirs}\n\n${mine}`)
      } else {
        cpSync(from, to)
      }
    }
    const summary = applyPolicy(work)
    rmSync(dist, { recursive: true, force: true })
    renameSync(work, dist)
    if (summary.without.length > 0) warn(listWithout(summary.without))
    return summary
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    if (error instanceof CspError) throw new AssembleError(error.message)
    throw error
  }
}
