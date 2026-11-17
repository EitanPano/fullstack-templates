// The post-build script that turns the pages' <meta> policies into one Content-Security-Policy
// header in dist/_headers, tested on fixture HTML and on a fixture dist folder.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CspError,
  addPolicyToHeaders,
  buildPolicy,
  extractPolicy,
  mergePolicies,
  liftPolicy,
  stripPolicy,
} from '../../scripts/lib/csp-headers.mjs'

const meta = (content: string) => `<meta http-equiv="content-security-policy" content="${content}">`
const page = (policy: string | null) =>
  `<!doctype html><html><head><title>t</title>${policy === null ? '' : meta(policy)}</head><body><h1>t</h1></body></html>`

const HASH_A = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const HASH_B = "'sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='"
const STYLE_A = "'sha256-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='"
const policyOf = (script: string[], style: string[]) =>
  `script-src 'self' ${script.join(' ')}; style-src 'self' ${style.join(' ')};`

describe('extractPolicy and stripPolicy', () => {
  it('reads the policy out of the meta and decodes its entities', () => {
    const html = page("script-src &#39;self&#39; 'sha256-X=';")
    expect(extractPolicy(html)).toBe("script-src 'self' 'sha256-X=';")
  })

  it('finds nothing in a page without a policy', () => {
    expect(extractPolicy(page(null))).toBeNull()
  })

  it('removes the meta and leaves the rest of the page', () => {
    const stripped = stripPolicy(page(policyOf([HASH_A], [STYLE_A])))
    expect(stripped).not.toContain('content-security-policy')
    expect(stripped).toContain('<title>t</title>')
    expect(stripped).toContain('<h1>t</h1>')
  })
})

describe('mergePolicies', () => {
  it('keeps one policy as it is', () => {
    const merged = mergePolicies([policyOf([HASH_A], [STYLE_A])])
    expect(merged.get('script-src')).toEqual(["'self'", HASH_A])
    expect(merged.get('style-src')).toEqual(["'self'", STYLE_A])
  })

  it('unions the hashes of pages that differ only in hashes', () => {
    const merged = mergePolicies([policyOf([HASH_A], [STYLE_A]), policyOf([HASH_B], [STYLE_A])])
    expect(merged.get('script-src')).toEqual(["'self'", HASH_A, HASH_B])
    expect(merged.get('style-src')).toEqual(["'self'", STYLE_A])
  })

  it('refuses pages whose policies differ in more than hashes', () => {
    const strict = "script-src 'self' 'strict-dynamic'; style-src 'self';"
    expect(() => mergePolicies([policyOf([HASH_A], [STYLE_A]), strict])).toThrow(CspError)
    expect(() => mergePolicies([policyOf([HASH_A], [STYLE_A]), strict])).toThrow(/script-src/)
  })

  it("refuses an 'unsafe-inline' source", () => {
    const unsafe = "script-src 'self' 'unsafe-inline'; style-src 'self';"
    expect(() => mergePolicies([unsafe])).toThrow(/unsafe-inline/)
  })

  it('refuses an empty list of policies', () => {
    expect(() => mergePolicies([])).toThrow(CspError)
  })
})

describe('buildPolicy', () => {
  it('writes the fixed directives and the merged script and style sources', () => {
    const line = buildPolicy(mergePolicies([policyOf([HASH_A], [STYLE_A])]))
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `script-src 'self' ${HASH_A}`,
      `style-src 'self' ${STYLE_A}`,
    ]) {
      expect(line).toContain(directive)
    }
    expect(line).not.toContain('unsafe-inline')
    expect(line).not.toContain('unsafe-eval')
  })

  it('refuses a directive the script sets itself', () => {
    const merged = mergePolicies([`default-src 'none'; ${policyOf([HASH_A], [STYLE_A])}`])
    expect(() => buildPolicy(merged)).toThrow(/default-src/)
  })
})

describe('addPolicyToHeaders', () => {
  const policy = "default-src 'self'; script-src 'self'"

  it('adds the header under the /* rule', () => {
    const out = addPolicyToHeaders('/*\n  X-Content-Type-Options: nosniff\n', policy)
    expect(out).toBe(
      `/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: ${policy}\n`,
    )
  })

  it('adds the /* rule when the file has none', () => {
    expect(addPolicyToHeaders('/api/*\n  X-A: b\n', policy)).toContain(
      `/*\n  Content-Security-Policy: ${policy}`,
    )
    expect(addPolicyToHeaders('', policy)).toBe(`/*\n  Content-Security-Policy: ${policy}\n`)
  })

  it('refuses a policy already written in _headers (the hashes change every build)', () => {
    expect(() =>
      addPolicyToHeaders('/*\n  Content-Security-Policy: default-src *\n', policy),
    ).toThrow(/already sets Content-Security-Policy/)
  })

  it("fails the build when the line exceeds the platform's 2000-character limit", () => {
    const long = `script-src 'self' ${'x'.repeat(2000)}`
    expect(() => addPolicyToHeaders('/*\n  X-A: b\n', long)).toThrow(/2000/)
  })

  it("fails the build when the file has more than the platform's 100 rules", () => {
    const rules = Array.from({ length: 100 }, (_, i) => `/p${String(i)}\n  X-A: b\n`).join('')
    expect(() => addPolicyToHeaders(rules, policy)).toThrow(/100/)
  })
})

describe('liftPolicy', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  function dist(pages: Record<string, string | null>, headers = '/*\n  X-A: b\n') {
    const folder = mkdtempSync(path.join(tmpdir(), 'csp-'))
    folders.push(folder)
    mkdirSync(path.join(folder, 'nested'))
    for (const [name, policy] of Object.entries(pages)) {
      writeFileSync(path.join(folder, name), page(policy))
    }
    writeFileSync(path.join(folder, '_headers'), headers)
    return folder
  }

  it('moves the policy of every page into _headers and strips the metas', () => {
    const folder = dist({
      'index.html': policyOf([HASH_A], [STYLE_A]),
      '404.html': policyOf([HASH_A], [STYLE_A]),
      'nested/other.html': policyOf([HASH_B], [STYLE_A]),
    })
    const { pages } = liftPolicy(folder)

    expect(pages).toBe(3)
    const headers = readFileSync(path.join(folder, '_headers'), 'utf8')
    expect(headers).toContain('Content-Security-Policy: default-src')
    expect(headers).toContain(HASH_A)
    expect(headers).toContain(HASH_B)
    expect(readFileSync(path.join(folder, 'index.html'), 'utf8')).not.toContain(
      'content-security-policy',
    )
  })

  it('serves a page without a meta under the same header and leaves it untouched', () => {
    const folder = dist({ 'index.html': policyOf([HASH_A], [STYLE_A]), '404.html': null })
    const before = readFileSync(path.join(folder, '404.html'), 'utf8')

    const result = liftPolicy(folder)

    expect(result).toMatchObject({ pages: 2, lifted: 1 })
    expect(readFileSync(path.join(folder, '404.html'), 'utf8')).toBe(before)
  })

  it('writes no line when no page carries a policy', () => {
    const folder = dist({ 'index.html': null })
    const result = liftPolicy(folder)

    expect(result.policy).toBeNull()
    expect(readFileSync(path.join(folder, '_headers'), 'utf8')).toBe('/*\n  X-A: b\n')
  })

  it('writes nothing when the policies cannot be merged', () => {
    const strict = "script-src 'self' 'strict-dynamic'; style-src 'self';"
    const folder = dist({ 'index.html': policyOf([HASH_A], [STYLE_A]), '404.html': strict })

    expect(() => liftPolicy(folder)).toThrow(CspError)
    expect(readFileSync(path.join(folder, 'index.html'), 'utf8')).toContain(
      'content-security-policy',
    )
  })

  it('finds no page in an empty folder and says nothing was lifted', () => {
    expect(liftPolicy(dist({}))).toMatchObject({ pages: 0, lifted: 0, policy: null })
  })
})
