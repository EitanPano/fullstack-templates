// csp-headers belongs: lifting the Content-Security-Policy a frontend's build wrote into each page's
// <meta http-equiv> into ONE `Content-Security-Policy` line of dist/_headers. A meta cannot carry
// frame-ancestors and governs only what follows it, so this merges the pages' policies, adds the
// directives a build does not write and puts the line under `/*`. The hashes change every build,
// so the line can never live in pages/_headers. A page without a meta is served under the same
// header; a build with no meta at all gets no line.
// It does not belong: copying files (assemble.mjs) or any other header (pages/_headers).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Cloudflare Pages' limits for a _headers file, checked 2026-11-17 at
// developers.cloudflare.com/pages/configuration/headers: up to 100 header rules, and each line of
// the file (spaces, name and value) has a 2,000 character limit.
export const MAX_RULES = 100
export const MAX_LINE = 2000

// The directives this script sets; a build writes only script-src and style-src.
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
        `the build wrote ${name}, which assemble sets itself; remove it from the frontend's policy configuration`,
      )
    }
  }
  return [...FIXED, ...merged].map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}

const isRule = (line) => line.trim() !== '' && !/^\s/.test(line) && !line.startsWith('#')

// The platform refuses a _headers file over its limits; failing here names the cause.
export function checkHeadersLimits(headers) {
  const lines = headers.split('\n')
  const long = lines.find((line) => line.length > MAX_LINE)
  if (long !== undefined) {
    throw new CspError(
      `a _headers line is ${String(long.length)} characters (it starts "${long.trim().slice(0, 40)}"); Pages allows ${String(MAX_LINE)} per line`,
    )
  }
  const rules = lines.filter(isRule).length
  if (rules > MAX_RULES) {
    throw new CspError(`_headers holds ${String(rules)} rules; Pages allows ${String(MAX_RULES)}`)
  }
}

export function addPolicyToHeaders(headers, policy) {
  if (/^\s*content-security-policy\s*:/im.test(headers)) {
    throw new CspError(
      "a _headers file already sets Content-Security-Policy: its hashes change every build, so only assemble writes it (remove the line from the frontend's public/_headers and pages/_headers)",
    )
  }
  const header = `  Content-Security-Policy: ${policy}`
  const lines = headers === '' ? [] : headers.replace(/\n$/, '').split('\n')
  const at = lines.findIndex((line) => line.trim() === '/*' && isRule(line))
  if (at === -1) lines.push('/*', header)
  else {
    let end = at + 1
    while (end < lines.length && !isRule(lines[end])) end++
    while (end > at + 1 && lines[end - 1].trim() === '') end--
    lines.splice(end, 0, header)
  }
  const result = `${lines.join('\n')}\n`
  checkHeadersLimits(result)
  return result
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    if (statSync(file).isDirectory()) return htmlFiles(file)
    return name.endsWith('.html') ? [file] : []
  })
}

// Lifts the policies of every page under `dist` into dist/_headers. Nothing is written until every
// check has passed, so a failed run leaves dist as it was.
export function liftPolicy(dist) {
  const files = htmlFiles(dist)
  const policies = []
  const pages = []
  for (const file of files) {
    const html = readFileSync(file, 'utf8')
    const policy = extractPolicy(html)
    if (policy === null) continue
    policies.push(policy)
    pages.push([file, stripPolicy(html)])
  }
  if (policies.length === 0) return { pages: files.length, lifted: 0, policy: null }
  const line = buildPolicy(mergePolicies(policies))
  const target = path.join(dist, '_headers')
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // No _headers yet: the file is created.
  }
  const headers = addPolicyToHeaders(current, line)
  for (const [file, html] of pages) writeFileSync(file, html)
  writeFileSync(target, headers)
  return { pages: files.length, lifted: pages.length, policy: line }
}
