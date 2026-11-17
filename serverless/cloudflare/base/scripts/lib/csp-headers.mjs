// csp-headers belongs: the Content-Security-Policy of a built site, in two halves that a browser
// intersects. Each page keeps the <meta http-equiv> its build wrote (its own script and style
// hashes, which change every build); this file checks that meta allows nothing but 'self' and
// hashes for scripts and styles, and writes ONE fixed header line under `/*` in dist/_headers
// for what a meta cannot carry (frame-ancestors) and for the rest. It never rewrites a page.
// It does not belong: copying files (assemble.mjs) or any other header (pages/_headers).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Cloudflare Pages' limits for a _headers file, checked 2026-11-17 at
// developers.cloudflare.com/pages/configuration/headers: up to 100 header rules, and each line of
// the file (spaces, name and value) has a 2,000 character limit.
export const MAX_RULES = 100
export const MAX_LINE = 2000

// No hash, and no default-src, script-src or style-src: a browser enforces every policy it is
// given, so a header default-src would block the hashed inline scripts the page's meta allows.
// The meta governs scripts and styles; this line adds the rest.
export const FIXED_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ')

export class CspError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CspError'
  }
}

// One pass, so an entity is never decoded twice (&amp;#39; stays &#39;).
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|apos|quot|lt|gt|amp);/gi, (whole, body) => {
    const name = body.toLowerCase()
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(name[1] === 'x' ? 2 : 1), name[1] === 'x' ? 16 : 10)
      return code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return { apos: "'", quot: '"', lt: '<', gt: '>', amp: '&' }[name]
  })
}

// A <meta> tag, its attributes read as a browser does: a name, then optionally `=` and a
// double-quoted, single-quoted or unquoted value. Only comments are stripped first; <noscript>,
// <template> and where in head or body a tag sits are not parsed.
const META_TAG = /<meta(?=[\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function attributes(source) {
  return [...source.matchAll(ATTRIBUTE)].map((match) => ({
    name: match[1].toLowerCase(),
    value: match[2] ?? match[3] ?? match[4] ?? '',
  }))
}

// Every policy <meta> of a page, decoded. A policy meta whose `content` is missing or given twice
// is an error (a page with a broken policy is not a page without one).
export function extractPolicies(html, file = 'a page') {
  const policies = []
  for (const tag of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(META_TAG)) {
    const found = attributes(tag[1])
    const equiv = found.find((attribute) => attribute.name === 'http-equiv')
    if (equiv?.value.trim().toLowerCase() !== 'content-security-policy') continue
    const contents = found.filter((attribute) => attribute.name === 'content')
    if (contents.length !== 1) {
      throw new CspError(
        `${file}: a policy meta has ${contents.length === 0 ? 'no' : 'more than one'} content attribute`,
      )
    }
    policies.push(decode(contents[0].value))
  }
  return policies
}

// Directive names and keywords are case-insensitive; a repeated directive counts once, the first.
function parsePolicy(text) {
  const directives = new Map()
  for (const part of text.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name && !directives.has(name.toLowerCase())) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

const HASH = /^'sha(256|384|512)-[^']+'$/
const allowed = (source) => {
  const lower = source.toLowerCase()
  return lower === "'self'" || lower === "'none'" || lower === "'strict-dynamic'" || HASH.test(lower)
}

// The directives that decide what a page may run or apply; `default-src` stands in for the
// script and style directives a policy leaves out.
const SCRIPT_STYLE = [
  'script-src',
  'script-src-elem',
  'script-src-attr',
  'style-src',
  'style-src-elem',
  'style-src-attr',
]

// A page's own policy may carry any directive, because a directive can only tighten the header's.
// Its script and style sources may hold 'self', hashes and 'strict-dynamic' and nothing else:
// no 'unsafe-inline', 'unsafe-eval', 'unsafe-hashes', nonce, host, scheme or `*`.
export function checkPagePolicy(policy, file) {
  const directives = parsePolicy(policy)
  const names = SCRIPT_STYLE.filter((name) => directives.has(name))
  if (!directives.has('script-src') || !directives.has('style-src')) {
    if (directives.has('default-src')) names.push('default-src')
  }
  for (const name of names) {
    const bad = (directives.get(name) ?? []).find((source) => !allowed(source))
    if (bad !== undefined) {
      throw new CspError(
        `${file}: its policy's ${name} allows ${bad}; a page's scripts and styles may be 'self' or hashed, nothing wider`,
      )
    }
  }
}

// Only assemble writes the header: a build's own `_headers` must neither set the policy nor
// detach it (`! Content-Security-Policy`, which would drop the line from a path).
const SETS_OR_DETACHES = /^[ \t]*!?[ \t]*content-security-policy[ \t]*(:|$)/im

export function checkHeadersSource(text, file) {
  if (SETS_OR_DETACHES.test(text)) {
    throw new CspError(
      `${file} sets or detaches Content-Security-Policy: only assemble writes it (remove the line)`,
    )
  }
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

export function addPolicyToHeaders(headers) {
  checkHeadersSource(headers, 'the merged _headers')
  const header = `  Content-Security-Policy: ${FIXED_POLICY}`
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

// Every .html under `dir`, as paths relative to it with `/`. A symbolic link is refused (the
// walk reads each entry's own type, never follows one).
function htmlFiles(dir, prefix = '') {
  return readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isSymbolicLink()) throw new CspError(`${relative} is a symbolic link; a build output holds none`)
    if (entry.isDirectory()) return htmlFiles(dir, relative)
    return entry.name.toLowerCase().match(/\.html?$/) ? [relative] : []
  })
}

// Checks the policy of every page under `dist`, then writes the fixed line into dist/_headers.
// Pages are never modified. Nothing is written until every check has passed, so a failed run
// leaves dist as it was. `without` lists the pages that have no policy meta.
export function applyPolicy(dist) {
  const without = []
  const files = htmlFiles(dist)
  for (const file of files) {
    const policies = extractPolicies(readFileSync(path.join(dist, file), 'utf8'), file)
    if (policies.length === 0) without.push(file)
    // Policies intersect in a browser, but a wider one is still a mistake: each is checked.
    for (const policy of policies) checkPagePolicy(policy, file)
  }
  const target = path.join(dist, '_headers')
  let current = ''
  try {
    current = readFileSync(target, 'utf8')
  } catch {
    // No _headers yet: the file is created.
  }
  writeFileSync(target, addPolicyToHeaders(current))
  return { pages: files.length, withPolicy: files.length - without.length, without }
}
