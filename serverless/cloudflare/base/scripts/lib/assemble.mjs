// assemble (lib) belongs: building the one folder Pages serves, `dist/`: the frontend's built
// output (when the plan has a frontend), then pages/'s files laid over it, then the build's
// Content-Security-Policy lifted into dist/_headers (csp-headers.mjs). It builds beside dist and
// swaps it in, so a failed run leaves the previous dist as it was.
// It does not belong: building the frontend (its own command) or running wrangler (start.mjs).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { CspError, checkHeadersLimits, liftPolicy } from './csp-headers.mjs'

export class AssembleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssembleError'
  }
}

// _headers and _redirects are merged, the frontend's lines first; every other file of pages/
// (_routes.json) replaces the frontend's.
const MERGED = new Set(['_headers', '_redirects'])

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full).map((f) => path.join(entry.name, f)) : [entry.name]
  })
}

// `frontend` is the frontend's built output directory, or null when the plan has none.
export function assemble({ pages, dist, frontend }) {
  if (!existsSync(pages)) throw new AssembleError(`${pages} is missing: it holds _routes.json`)
  if (frontend !== null && (!existsSync(frontend) || readdirSync(frontend).length === 0)) {
    throw new AssembleError(
      `the frontend's output ${frontend} is missing or empty: build the frontend first`,
    )
  }
  const work = `${dist}.assembling`
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    if (frontend !== null) cpSync(frontend, work, { recursive: true })
    for (const relative of files(pages)) {
      const from = path.join(pages, relative)
      const to = path.join(work, relative)
      mkdirSync(path.dirname(to), { recursive: true })
      if (MERGED.has(relative) && existsSync(to)) {
        const theirs = readFileSync(to, 'utf8').replace(/\s+$/, '')
        const ours = readFileSync(from, 'utf8').replace(/^\s+/, '')
        writeFileSync(to, `${theirs}\n\n${ours}`)
      } else {
        cpSync(from, to)
      }
    }
    const summary = liftPolicy(work)
    for (const name of MERGED) {
      const file = path.join(work, name)
      if (name === '_headers' && existsSync(file)) checkHeadersLimits(readFileSync(file, 'utf8'))
    }
    rmSync(dist, { recursive: true, force: true })
    renameSync(work, dist)
    return summary
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    if (error instanceof CspError) throw new AssembleError(error.message)
    throw error
  }
}
