// The post-build policy script: it checks each page's <meta> policy, leaves the pages alone and
// writes one fixed Content-Security-Policy line into dist/_headers. Tested on fixture HTML and on
// a fixture dist folder.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CspError,
  FIXED_POLICY,
  addPolicyToHeaders,
  applyPolicy,
  checkHeadersSource,
  checkPagePolicy,
  extractPolicies,
} from '../../scripts/lib/csp-headers.mjs'

const meta = (content: string) => `<meta http-equiv="content-security-policy" content="${content}">`
const page = (policy: string | null) =>
  `<!doctype html><html><head><title>t</title>${policy === null ? '' : meta(policy)}</head><body><h1>t</h1></body></html>`

const HASH_A = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const HASH_B = "'sha384-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='"
const STYLE_A = "'sha512-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC='"
const policyOf = (script: string[], style: string[]) =>
  `script-src 'self' ${script.join(' ')}; style-src 'self' ${style.join(' ')};`

const wrap = (head: string) => `<!doctype html><html><head>${head}</head><body></body></html>`

describe('extractPolicies', () => {
  it('reads the policy out of the meta and decodes its entities', () => {
    const html = page("script-src &#39;self&#39; 'sha256-X=';")
    expect(extractPolicies(html)).toEqual(["script-src 'self' 'sha256-X=';"])
  })

  it('finds nothing in a page without a policy', () => {
    expect(extractPolicies(page(null))).toEqual([])
  })

  it.each([
    ['&apos;', "script-src &apos;self&apos;"],
    ['a decimal reference', 'script-src &#39;self&#39;'],
    ['a hex reference', 'script-src &#x27;self&#x27;'],
    ['an upper-case hex reference', 'script-src &#X27;self&#X27;'],
  ])('decodes %s', (_label, content) => {
    expect(extractPolicies(page(content))).toEqual(["script-src 'self'"])
  })

  it('decodes an entity once', () => {
    expect(extractPolicies(page('script-src &amp;#39;self'))).toEqual(['script-src &#39;self'])
  })

  it('reads only the attribute named content, not data-content', () => {
    const html = wrap(
      `<meta http-equiv="content-security-policy" data-content="default-src 'self'" content="script-src *">`,
    )
    expect(extractPolicies(html)).toEqual(['script-src *'])
  })

  it('reads attributes in either order and unquoted or single-quoted values', () => {
    const policies = extractPolicies(
      wrap(
        `<meta content="script-src 'self'" http-equiv="Content-Security-Policy">` +
          `<meta http-equiv=content-security-policy content='style-src &quot;x&quot;'>` +
          `<META HTTP-EQUIV='CONTENT-SECURITY-POLICY' CONTENT=default-src>`,
      ),
    )
    expect(policies).toEqual(["script-src 'self'", 'style-src "x"', 'default-src'])
  })

  it('ignores a meta that is not a policy and one inside a comment', () => {
    const html = wrap(
      `<meta charset="utf-8"><meta name="description" content="x"><!-- ${meta("script-src *")} -->`,
    )
    expect(extractPolicies(html)).toEqual([])
  })

  it('refuses a policy meta with no content or two, naming the file', () => {
    const none = wrap('<meta http-equiv="content-security-policy">')
    const twice = wrap(
      `<meta http-equiv="content-security-policy" content="script-src 'self'" content="script-src *">`,
    )
    expect(() => extractPolicies(none, 'a.html')).toThrow(/a\.html.*no content/)
    expect(() => extractPolicies(twice, 'b.html')).toThrow(/b\.html.*more than one content/)
  })

  it('finds every policy meta of a page', () => {
    expect(extractPolicies(wrap(meta("a-src 'self'") + meta("b-src 'self'")))).toHaveLength(2)
  })
})

describe('checkPagePolicy', () => {
  it("accepts 'self', hashes and 'strict-dynamic' in script-src and style-src", () => {
    expect(() =>
      checkPagePolicy(
        `script-src 'self' ${HASH_A} ${HASH_B} 'strict-dynamic'; style-src 'self' ${STYLE_A};`,
        'index.html',
      ),
    ).not.toThrow()
  })

  it('accepts other directives: they only tighten', () => {
    expect(() =>
      checkPagePolicy(
        `default-src 'self'; img-src 'self' data:; connect-src 'self'; ${policyOf([HASH_A], [STYLE_A])}`,
        'index.html',
      ),
    ).not.toThrow()
  })

  it("accepts 'none': it allows nothing", () => {
    expect(() => checkPagePolicy("script-src 'none'; style-src 'self';", 'index.html')).not.toThrow()
  })

  it.each([
    ["'unsafe-inline'", "script-src 'self' 'unsafe-inline'; style-src 'self';"],
    ["'UNSAFE-INLINE' in capitals", "script-src 'self' 'UNSAFE-INLINE'; style-src 'self';"],
    ["'unsafe-eval'", "script-src 'self' 'unsafe-eval'; style-src 'self';"],
    ["'unsafe-hashes'", "script-src 'self' 'unsafe-hashes'; style-src 'self';"],
    ['a wildcard', "script-src 'self' *; style-src 'self';"],
    ['data:', "script-src 'self'; style-src 'self' data:;"],
    ['https:', "script-src 'self' https:; style-src 'self';"],
    ['a host', "script-src 'self' https://cdn.example.com; style-src 'self';"],
    ['a nonce', "script-src 'self' 'nonce-abc'; style-src 'self';"],
    ['a directive written in capitals', "SCRIPT-SRC 'self' 'unsafe-inline'; style-src 'self';"],
    ['script-src-elem', "script-src 'self'; script-src-elem 'unsafe-inline'; style-src 'self';"],
    ['style-src-attr', "script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline';"],
  ])('refuses %s, naming the file', (_label, policy) => {
    expect(() => checkPagePolicy(policy, 'nested/other.html')).toThrow(CspError)
    expect(() => checkPagePolicy(policy, 'nested/other.html')).toThrow(/nested\/other\.html/)
  })

  it('checks default-src only where script-src or style-src is absent', () => {
    expect(() => checkPagePolicy("default-src 'unsafe-inline'", 'a.html')).toThrow(/default-src/)
    expect(() => checkPagePolicy("default-src *; script-src 'self'", 'a.html')).toThrow(/default-src/)
    expect(() =>
      checkPagePolicy("default-src *; script-src 'self'; style-src 'self'", 'a.html'),
    ).not.toThrow()
  })

  it('reads the first of two equal directives, as a browser does', () => {
    expect(() =>
      checkPagePolicy("script-src 'self'; script-src 'unsafe-inline'; style-src 'self'", 'a.html'),
    ).not.toThrow()
  })
})

describe('checkHeadersSource', () => {
  it('accepts a file that sets other headers, comments and a report-only policy', () => {
    expect(() =>
      checkHeadersSource(
        '# Content-Security-Policy: none\n/*\n  X-A: b\n  Content-Security-Policy-Report-Only: default-src *\n',
        'pages/_headers',
      ),
    ).not.toThrow()
  })

  it.each([
    ['sets it', '/*\n  Content-Security-Policy: default-src *\n'],
    ['sets it in lower case', '/*\n  content-security-policy: default-src *\n'],
    ['sets it in capitals', '/*\n  CONTENT-SECURITY-POLICY: default-src *\n'],
    ['detaches it', '/*\n  ! Content-Security-Policy\n'],
    ['detaches it in lower case', '/*\n  !content-security-policy\n'],
  ])('refuses a file that %s, naming the file', (_label, text) => {
    expect(() => checkHeadersSource(text, 'public/_headers')).toThrow(CspError)
    expect(() => checkHeadersSource(text, 'public/_headers')).toThrow(/public\/_headers/)
  })
})

describe('addPolicyToHeaders', () => {
  it('adds the fixed line under the first /* rule', () => {
    const out = addPolicyToHeaders('/*\n  X-Content-Type-Options: nosniff\n/b\n  X-B: 1\n')
    expect(out).toBe(
      `/*\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: ${FIXED_POLICY}\n/b\n  X-B: 1\n`,
    )
  })

  it('adds the /* rule when the file has none', () => {
    expect(addPolicyToHeaders('/api/*\n  X-A: b\n')).toContain(
      `/*\n  Content-Security-Policy: ${FIXED_POLICY}`,
    )
    expect(addPolicyToHeaders('')).toBe(`/*\n  Content-Security-Policy: ${FIXED_POLICY}\n`)
  })

  it('writes what a meta cannot carry and nothing that would block the meta', () => {
    for (const directive of [
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
    ]) {
      expect(FIXED_POLICY).toContain(directive)
    }
    // A browser enforces every policy: a header default-src, script-src or style-src would block
    // the hashed inline scripts and styles the page's own meta allows.
    expect(FIXED_POLICY).not.toMatch(/(^|;\s*)(default-src|script-src|style-src)/)
    expect(FIXED_POLICY).not.toContain('sha256')
    expect(FIXED_POLICY).not.toContain('unsafe-inline')
  })

  it('refuses a file that already sets or detaches a policy', () => {
    expect(() => addPolicyToHeaders('/*\n  Content-Security-Policy: default-src *\n')).toThrow(
      /Content-Security-Policy/,
    )
    expect(() => addPolicyToHeaders('/*\n  ! content-security-policy\n')).toThrow(
      /Content-Security-Policy/,
    )
  })

  it("fails the build when a line exceeds the platform's 2000-character limit", () => {
    expect(() => addPolicyToHeaders(`/*\n  X-A: ${'x'.repeat(2000)}\n`)).toThrow(/2000/)
  })

  it("fails the build when the file has more than the platform's 100 rules", () => {
    const rules = Array.from({ length: 100 }, (_, i) => `/p${String(i)}\n  X-A: b\n`).join('')
    expect(() => addPolicyToHeaders(rules)).toThrow(/100/)
  })
})

describe('applyPolicy', () => {
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

  it('writes the fixed line and leaves every page byte for byte as it was', () => {
    const folder = dist({
      'index.html': policyOf([HASH_A], [STYLE_A]),
      '404.html': policyOf([HASH_A], [STYLE_A]),
      'nested/other.html': policyOf([HASH_B], [STYLE_A]),
    })
    const before = readFileSync(path.join(folder, 'index.html'), 'utf8')

    const result = applyPolicy(folder)

    expect(result).toMatchObject({ pages: 3, withPolicy: 3, without: [] })
    expect(readFileSync(path.join(folder, '_headers'), 'utf8')).toBe(
      `/*\n  X-A: b\n  Content-Security-Policy: ${FIXED_POLICY}\n`,
    )
    expect(readFileSync(path.join(folder, 'index.html'), 'utf8')).toBe(before)
  })

  it('lists the pages without a meta, relative to dist, and serves them as they are', () => {
    const folder = dist({
      'index.html': policyOf([HASH_A], [STYLE_A]),
      '404.html': null,
      'nested/old.html': null,
    })

    const result = applyPolicy(folder)

    expect(result.withPolicy).toBe(1)
    expect([...result.without].sort()).toEqual(['404.html', 'nested/old.html'])
  })

  it('still writes the line in a folder with no page', () => {
    const result = applyPolicy(dist({}))

    expect(result).toMatchObject({ pages: 0, withPolicy: 0, without: [] })
  })

  it('refuses a page with an unsafe policy, naming it, and writes nothing', () => {
    const folder = dist({
      'index.html': policyOf([HASH_A], [STYLE_A]),
      'nested/bad.html': "script-src 'self' 'UNSAFE-INLINE'; style-src 'self';",
    })

    expect(() => applyPolicy(folder)).toThrow(/nested\/bad\.html/)
    expect(readFileSync(path.join(folder, '_headers'), 'utf8')).toBe('/*\n  X-A: b\n')
  })

  it('refuses a data-content decoy: the browser enforces the content attribute', () => {
    const folder = dist({})
    writeFileSync(
      path.join(folder, 'index.html'),
      wrap(
        `<meta http-equiv="content-security-policy" data-content="default-src 'self'" content="script-src *">`,
      ),
    )

    expect(() => applyPolicy(folder)).toThrow(/index\.html.*script-src/)
  })

  it('refuses a policy meta with a repeated or missing content, naming the page', () => {
    const folder = dist({})
    writeFileSync(
      path.join(folder, 'index.html'),
      wrap(`<meta http-equiv="content-security-policy" content="a" content="b">`),
    )
    expect(() => applyPolicy(folder)).toThrow(/index\.html/)

    writeFileSync(path.join(folder, 'index.html'), wrap('<meta http-equiv=content-security-policy>'))
    expect(() => applyPolicy(folder)).toThrow(/index\.html/)
  })

  it('checks an unquoted http-equiv meta', () => {
    const folder = dist({})
    writeFileSync(
      path.join(folder, 'index.html'),
      wrap("<meta http-equiv=content-security-policy content=\"script-src 'unsafe-inline'\">"),
    )

    expect(() => applyPolicy(folder)).toThrow(/unsafe-inline/)
  })

  it('lists a page whose only policy meta is commented out as having none', () => {
    const folder = dist({})
    writeFileSync(path.join(folder, 'index.html'), wrap(`<!-- ${meta("script-src 'self'")} -->`))

    expect(applyPolicy(folder)).toMatchObject({ withPolicy: 0, without: ['index.html'] })
  })

  it('refuses a page whose second meta is wider than the first', () => {
    const folder = dist({})
    writeFileSync(
      path.join(folder, 'index.html'),
      wrap(meta(policyOf([HASH_A], [STYLE_A])) + meta('script-src *')),
    )

    expect(() => applyPolicy(folder)).toThrow(/index\.html.*\*/)
  })

  it('checks a .htm page', () => {
    const folder = dist({})
    writeFileSync(path.join(folder, 'old.htm'), wrap(meta("script-src 'unsafe-inline'")))

    expect(() => applyPolicy(folder)).toThrow(/old\.htm/)
  })

  it("accepts a hand-written policy spelled with &apos; or &#x27;", () => {
    const folder = dist({})
    writeFileSync(
      path.join(folder, 'a.html'),
      wrap(meta("script-src &apos;self&apos;; style-src &#x27;self&#x27;")),
    )

    expect(applyPolicy(folder)).toMatchObject({ pages: 1, withPolicy: 1 })
  })

  it('accepts sixty pages with distinct inline-script hashes', () => {
    const pages: Record<string, string | null> = {}
    for (let i = 0; i < 60; i++) {
      pages[`p${String(i)}.html`] = policyOf([`'sha256-${String(i).padStart(43, 'x')}='`], [STYLE_A])
    }

    const result = applyPolicy(dist(pages))

    expect(result).toMatchObject({ pages: 60, withPolicy: 60 })
  })
})
