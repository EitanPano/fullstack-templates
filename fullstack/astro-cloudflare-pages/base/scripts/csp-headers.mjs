// csp-headers belongs: the step after `astro build`. Astro's `security.csp` writes each page's
// policy (hashed script-src and style-src) into a <meta>; a meta cannot carry frame-ancestors and
// governs only what follows it, so this lifts the policy out of every page, merges it, adds the
// directives Astro does not write and puts one Content-Security-Policy line under `/*` in
// dist/_headers. The hashes change every build, so the line can never live in public/_headers.
// It does not belong: any other header (public/_headers) or the Functions' headers (the middleware).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Cloudflare Pages' limits for a _headers file (developers.cloudflare.com/pages/configuration/headers).
const MAX_RULES = 100
const MAX_LINE = 2000

// The directives this script sets; Astro writes only script-src and style-src.
const FIXED = [
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['img-src', ["'self'", 'data:']],
  ['font-src', ["'self'"]],
]

export class CspError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CspError'
  }
}

const META = /<meta\s+[^>]*http-equiv=["']content-security-policy["'][^>]*>/i
const isHash = (source) => /^'sha(256|384|512)-[^']+'$/.test(source)

function decode(text) {
  return text
    .replaceAll('&#39;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

export function extractPolicy(html) {
  const tag = META.exec(html)?.[0]
  if (tag === undefined) return null
  const content = /content=("([^"]*)"|'([^']*)')/i.exec(tag)
  return content === null ? null : decode(content[2] ?? content[3] ?? '')
}

export function stripPolicy(html) {
  return html.replace(META, '')
}

function parsePolicy(text) {
  const directives = new Map()
  for (const part of text.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

// Pages that differ only in hashes merge (the union is safe site-wide); anything else is refused.
export function mergePolicies(policies) {
  if (policies.length === 0) throw new CspError('no policy to merge')
  const merged = new Map()
  for (const [index, text] of policies.entries()) {
    const parsed = parsePolicy(text)
    if (index > 0 && [...parsed.keys()].sort().join() !== [...merged.keys()].sort().join()) {
      throw new CspError('pages carry policies with different directives; they cannot be merged')
    }
    for (const [name, sources] of parsed) {
      if (sources.includes("'unsafe-inline'") || sources.includes("'unsafe-eval'")) {
        throw new CspError(`${name} allows 'unsafe-inline' or 'unsafe-eval'; hash it instead`)
      }
      if (!merged.has(name)) {
        merged.set(name, [...sources])
        continue
      }
      const current = merged.get(name)
      const plain = (list) => list.filter((source) => !isHash(source)).join(' ')
      if (plain(sources) !== plain(current)) {
        throw new CspError(`pages carry different ${name} sources besides hashes; cannot merge`)
      }
      for (const source of sources) if (!current.includes(source)) current.push(source)
    }
  }
  return merged
}

export function buildPolicy(merged) {
  const fixedNames = new Set(FIXED.map(([name]) => name))
  for (const name of merged.keys()) {
    if (fixedNames.has(name)) {
      throw new CspError(
        `Astro wrote ${name}, which csp-headers.mjs sets itself; remove it from astro.config.mjs`,
      )
    }
  }
  return [...FIXED, ...merged].map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

const isRule = (line) => line.trim() !== '' && !/^\s/.test(line) && !line.startsWith('#')

export function addPolicyToHeaders(headers, policy) {
  if (/^\s*content-security-policy\s*:/im.test(headers)) {
    throw new CspError(
      'public/_headers already sets Content-Security-Policy: its hashes change every build, so only this script writes it',
    )
  }
  const header = `  Content-Security-Policy: ${policy}`
  if (header.length > MAX_LINE) {
    throw new CspError(
      `the Content-Security-Policy line is ${String(header.length)} characters; _headers allows ${String(MAX_LINE)} per line`,
    )
  }
  const lines = headers === '' ? [] : headers.replace(/\n$/, '').split('\n')
  const at = lines.findIndex((line) => line.trim() === '/*' && isRule(line))
  if (at === -1) lines.push('/*', header)
  else {
    let end = at + 1
    while (end < lines.length && !isRule(lines[end])) end++
    while (end > at + 1 && lines[end - 1].trim() === '') end--
    lines.splice(end, 0, header)
  }
  const rules = lines.filter(isRule).length
  if (rules > MAX_RULES) {
    throw new CspError(`_headers holds ${String(rules)} rules; Pages allows ${String(MAX_RULES)}`)
  }
  return `${lines.join('\n')}\n`
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return htmlFiles(file)
    return name.endsWith('.html') ? [file] : []
  })
}

export function run(dist = 'dist') {
  const files = htmlFiles(dist)
  if (files.length === 0) throw new CspError(`no page in ${dist}: run astro build first`)
  const policies = []
  const pages = []
  for (const file of files) {
    const html = readFileSync(file, 'utf8')
    const policy = extractPolicy(html)
    if (policy === null) {
      throw new CspError(`${path.relative(dist, file)} carries no policy: is security.csp on?`)
    }
    policies.push(policy)
    pages.push([file, stripPolicy(html)])
  }
  const line = buildPolicy(mergePolicies(policies))
  const target = path.join(dist, '_headers')
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // No public/_headers: the file is created.
  }
  const headers = addPolicyToHeaders(current, line)
  // Nothing is written until every check has passed, so a failed run leaves dist as built.
  for (const [file, html] of pages) writeFileSync(file, html)
  writeFileSync(target, headers)
  return { pages: files.length, policy: line }
}

const entry = process.argv[1]
if (
  entry &&
  import.meta.url.toLowerCase() === pathToFileURL(path.resolve(entry)).href.toLowerCase()
) {
  try {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
    const { pages, policy } = run(dist)
    console.log(`csp-headers: ${String(pages)} pages, ${String(policy.length)} characters`)
  } catch (error) {
    console.error(`csp-headers: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
