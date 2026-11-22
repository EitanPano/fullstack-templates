// assemble (lib) belongs: building the one folder the Worker's assets serve, `dist/`: the
// frontend's built output (when the plan has a frontend), then static/'s files laid over it, then
// the build's policy checked and the fixed Content-Security-Policy line written into dist/_headers
// (csp-headers.mjs). With several frontends each build goes to `dist/<dir>/`, its `_headers` and
// `_redirects` merged into the root files with the folder in front of every path, and the policy
// line is written per folder. It builds beside dist and swaps it in, so a failed run leaves the
// previous dist as it was. It never rewrites a page.
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

import {
  CspError,
  addPolicyToHeaders,
  applyPolicy,
  checkHeadersSource,
  checkPages,
} from './csp-headers.mjs'

export class AssembleError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AssembleError'
  }
}

// _headers and _redirects are merged, the frontend's lines first; any other file of static/
// replaces the frontend's.
const MERGED = new Set(['_headers', '_redirects'])

const SHOWN = 10

// A folder under dist/ is named for its frontend's directory: one lower-case name.
const FOLDER = /^[a-z][a-z0-9-]*$/

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

const isEmptyBuild = (build) => !existsSync(build) || readdirSync(build).length === 0

// A rule line of a _headers file is one that starts in the first column and is no comment.
const isRuleLine = (line) => line.trim() !== '' && !/^\s/.test(line) && !line.startsWith('#')

// A frontend's `_headers` with its folder in front of every rule: `/*` of the `site` frontend
// becomes `/site/*`. A rule that is not a path (Pages' host rules) means nothing beside several
// frontends, so it is refused.
export function prefixHeaders(text, dir, label) {
  return text
    .split('\n')
    .map((line) => {
      if (!isRuleLine(line)) return line
      const rule = line.trimEnd()
      if (!rule.startsWith('/')) {
        throw new AssembleError(
          `${label}: the rule "${rule}" must be a path starting with / (a host rule has no meaning beside several frontends)`,
        )
      }
      return `/${dir}${rule}`
    })
    .join('\n')
}

// A frontend's `_redirects` with its folder in front of the source and of a destination that is a
// path; a full URL stays as it is. The Worker removes the folder from the Location again.
export function prefixRedirects(text, dir, label) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) return line
      const [source = '', destination, ...rest] = trimmed.split(/\s+/)
      if (!source.startsWith('/') || source.startsWith('//')) {
        throw new AssembleError(`${label}: the source "${source}" must be a path starting with /`)
      }
      if (destination === undefined) {
        throw new AssembleError(`${label}: the redirect "${trimmed}" has no destination`)
      }
      let target = destination
      if (destination.startsWith('/') && !destination.startsWith('//')) {
        target = `/${dir}${destination}`
      } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(destination)) {
        throw new AssembleError(
          `${label}: the destination "${destination}" must be a path starting with / or a full URL`,
        )
      }
      return [`/${dir}${source}`, target, ...rest].join(' ')
    })
    .join('\n')
}

// Joins texts with one blank line between them, trimming the seams.
const joined = (parts) =>
  parts.map((part, at) => (at === 0 ? part.replace(/\s+$/, '') : part.replace(/^\s+/, ''))).join('\n\n')

function swap(work, dist) {
  rmSync(dist, { recursive: true, force: true })
  renameSync(work, dist)
}

// The `--frontend <dir>=<output dir>` pairs of a command line, by dir. A value that is no pair or
// names no frontend of the project fails: ignoring it would assemble the wrong build in silence.
export function frontendOverrides(argv, names) {
  const given = new Map()
  argv.forEach((arg, at) => {
    if (arg !== '--frontend') return
    const pair = argv[at + 1] ?? ''
    const split = pair.indexOf('=')
    if (split <= 0 || split === pair.length - 1) {
      throw new AssembleError(`--frontend must read <dir>=<output dir> beside several frontends: ${pair}`)
    }
    const dir = pair.slice(0, split)
    if (!names.includes(dir)) {
      throw new AssembleError(`--frontend names "${dir}", which is not a frontend (${names.join(', ')})`)
    }
    given.set(dir, pair.slice(split + 1))
  })
  return given
}

// `frontends` is a list of { dir, build } (several frontends, each into dist/<dir>/); `only` names
// the one of them to assemble alone. `frontend` is the one frontend's built output directory, null
// when the plan has none. `warn` receives the one warning about pages that have no policy meta.
/**
 * @param {{
 *   statics: string
 *   dist: string
 *   frontend?: string | null
 *   frontends?: { dir: string; build: string }[] | null
 *   only?: string
 *   warn?: (message: string) => void
 * }} options
 * @returns {{ pages: number; withPolicy: number; without: string[] }}
 */
export function assemble({
  statics,
  dist,
  frontend = null,
  frontends = null,
  only,
  warn = (message) => {
    process.stderr.write(`assemble: warning: ${message}\n`)
  },
}) {
  if (!existsSync(statics)) {
    throw new AssembleError(`${statics} is missing: it holds the base _headers and _redirects`)
  }
  if (frontends !== null) return assembleSeveral({ statics, dist, frontends, only, warn })
  if (frontend !== null && isEmptyBuild(frontend)) {
    throw new AssembleError(
      `the frontend's output ${frontend} is missing or empty: build the frontend first`,
    )
  }
  const work = `${dist}.assembling`
  rmSync(work, { recursive: true, force: true })
  try {
    const own = files(statics, 'static/')
    if (frontend !== null) {
      files(frontend, "the frontend's output")
      const theirs = path.join(frontend, '_headers')
      if (existsSync(theirs)) {
        checkHeadersSource(readFileSync(theirs, 'utf8'), "the frontend's _headers")
      }
    }
    const ours = path.join(statics, '_headers')
    if (existsSync(ours)) checkHeadersSource(readFileSync(ours, 'utf8'), 'static/_headers')

    mkdirSync(work, { recursive: true })
    if (frontend !== null) cpSync(frontend, work, { recursive: true })
    for (const relative of own) {
      const from = path.join(statics, relative)
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
    swap(work, dist)
    if (summary.without.length > 0) warn(listWithout(summary.without))
    return summary
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    if (error instanceof CspError) throw new AssembleError(error.message)
    throw error
  }
}

/**
 * @param {{
 *   statics: string
 *   dist: string
 *   frontends: { dir: string; build: string }[]
 *   only?: string
 *   warn: (message: string) => void
 * }} options
 * @returns {{ pages: number; withPolicy: number; without: string[] }}
 */
function assembleSeveral({ statics, dist, frontends, only, warn }) {
  const names = frontends.map((item) => item.dir)
  if (only !== undefined && !names.includes(only)) {
    throw new AssembleError(`--only names "${only}", which is not a frontend (${names.join(', ')})`)
  }
  const chosen = only === undefined ? frontends : frontends.filter((item) => item.dir === only)
  for (const { dir, build } of chosen) {
    if (!FOLDER.test(dir)) {
      throw new AssembleError(`the frontend directory "${dir}" is not one lower-case name`)
    }
    if (isEmptyBuild(build)) {
      throw new AssembleError(
        `the build of frontend "${dir}" (${build}) is missing or empty: build it first`,
      )
    }
  }
  const work = `${dist}.assembling`
  rmSync(work, { recursive: true, force: true })
  try {
    const own = files(statics, 'static/')
    const ours = path.join(statics, '_headers')
    if (existsSync(ours)) checkHeadersSource(readFileSync(ours, 'utf8'), 'static/_headers')

    const headers = []
    const redirects = []
    mkdirSync(work, { recursive: true })
    for (const { dir, build } of chosen) {
      files(build, `the output of frontend "${dir}"`)
      // A nested `_headers` or `_redirects` would be served as text: the platform reads only the
      // root ones, which carry this frontend's lines instead.
      const keep = (source) => !MERGED.has(path.relative(build, source))
      const text = (name) => {
        const file = path.join(build, name)
        return existsSync(file) ? readFileSync(file, 'utf8') : null
      }
      const theirHeaders = text('_headers')
      if (theirHeaders !== null) {
        const label = `_headers of frontend "${dir}"`
        checkHeadersSource(theirHeaders, label)
        headers.push(prefixHeaders(theirHeaders, dir, label))
      }
      const theirRedirects = text('_redirects')
      if (theirRedirects !== null) {
        redirects.push(prefixRedirects(theirRedirects, dir, `_redirects of frontend "${dir}"`))
      }
      cpSync(build, path.join(work, dir), { recursive: true, filter: keep })
    }
    for (const relative of own) {
      if (MERGED.has(relative)) continue
      const to = path.join(work, relative)
      mkdirSync(path.dirname(to), { recursive: true })
      cpSync(path.join(statics, relative), to)
    }
    const base = (name) =>
      existsSync(path.join(statics, name)) ? [readFileSync(path.join(statics, name), 'utf8')] : []
    const parts = (texts) => joined(texts.filter((part) => part.trim() !== ''))
    const summary = { pages: 0, withPolicy: 0, without: [] }
    for (const { dir } of chosen) {
      let checked
      try {
        checked = checkPages(path.join(work, dir))
      } catch (error) {
        if (error instanceof CspError) throw new CspError(`frontend "${dir}": ${error.message}`)
        throw error
      }
      summary.pages += checked.pages
      summary.withPolicy += checked.withPolicy
      summary.without.push(...checked.without.map((page) => `${dir}/${page}`))
    }
    const mergedHeaders = addPolicyToHeaders(
      parts([...headers, ...base('_headers')]),
      chosen.map(({ dir }) => `/${dir}/*`),
    )
    writeFileSync(path.join(work, '_headers'), mergedHeaders)
    writeFileSync(
      path.join(work, '_redirects'),
      `${parts([...redirects, ...base('_redirects')])}\n`,
    )
    swap(work, dist)
    if (summary.without.length > 0) warn(listWithout(summary.without))
    return summary
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    if (error instanceof CspError) throw new AssembleError(error.message)
    throw error
  }
}
