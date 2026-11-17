import { describe, expect, test } from 'bun:test'
import {
  MarkerError,
  applyMarkers,
  commentSyntaxFor,
  commentSyntaxesFor,
  findLeftoverMarker,
} from '../lib/markers'
import { isTextFile } from '../lib/placeholders'

const ts = ['//', ''] as const
const on = { auth: true }
const off = { auth: false }

describe('applyMarkers', () => {
  test('keeps an @auth line only when on and strips the marker', () => {
    expect(applyMarkers('a // @auth\nb\n', ts, 'f.ts', on)).toBe('a\nb\n')
    expect(applyMarkers('a // @auth\nb\n', ts, 'f.ts', off)).toBe('b\n')
  })
  test('keeps an @noauth line only when off', () => {
    expect(applyMarkers('a // @noauth\n', ts, 'f.ts', off)).toBe('a\n')
    expect(applyMarkers('a // @noauth\n', ts, 'f.ts', on)).toBe('')
  })
  test('drops a block when its flag is off and the block lines when on', () => {
    const src = '// @auth-start\nx\ny\n// @auth-end\nz\n'
    expect(applyMarkers(src, ts, 'f.ts', on)).toBe('x\ny\nz\n')
    expect(applyMarkers(src, ts, 'f.ts', off)).toBe('z\n')
  })
  test('handles markdown comment syntax', () => {
    expect(applyMarkers('a <!-- @auth -->\n', ['<!--', ' -->'], 'f.md', on)).toBe('a\n')
  })
  test('accepts capability:provider names', () => {
    expect(
      applyMarkers('p // @database:postgres\nm // @nodatabase\n', ts, 'f.ts', {
        database: true,
        'database:postgres': true,
      }),
    ).toBe('p\n')
  })
  test('preserves CRLF line endings', () => {
    expect(applyMarkers('a // @auth\r\nb\r\n', ts, 'f.ts', on)).toBe('a\r\nb\r\n')
  })
  test('rejects an unknown marker name with file:line', () => {
    expect(() => applyMarkers('a // @oauth\n', ts, 'f.ts', on)).toThrow(MarkerError)
    expect(() => applyMarkers('a // @oauth\n', ts, 'f.ts', on)).toThrow('f.ts:1')
  })
  test('rejects nested and unbalanced blocks', () => {
    expect(() =>
      applyMarkers('// @auth-start\n// @auth-start\n// @auth-end\n', ts, 'f.ts', on),
    ).toThrow(MarkerError)
    expect(() => applyMarkers('// @auth-start\nx\n', ts, 'f.ts', on)).toThrow('never closed')
    expect(() => applyMarkers('x\n// @auth-end\n', ts, 'f.ts', on)).toThrow('unbalanced')
  })
  test('keeps a negated block only when its flag is off', () => {
    const src = '// @noauth-start\nx\n// @noauth-end\ny\n'
    expect(applyMarkers(src, ts, 'f.ts', off)).toBe('x\ny\n')
    expect(applyMarkers(src, ts, 'f.ts', on)).toBe('y\n')
  })
  test('resolves a selected name that starts with no as the name, not negated', () => {
    expect(applyMarkers('a // @nothing\n', ts, 'f.ts', { nothing: true, thing: false })).toBe('a\n')
    expect(applyMarkers('a // @nothing\n', ts, 'f.ts', { nothing: false, thing: true })).toBe('')
  })
  test('rejects a mismatched block pair', () => {
    const src = '// @a-start\nx\n// @b-end\n'
    expect(() => applyMarkers(src, ts, 'f.ts', { a: true, b: true })).toThrow('unbalanced')
  })
  test('preserves CRLF through block markers', () => {
    const src = '// @auth-start\r\nx\r\n// @auth-end\r\ny\r\n'
    expect(applyMarkers(src, ts, 'f.ts', on)).toBe('x\r\ny\r\n')
  })
  test('does not resolve inherited object keys as names', () => {
    expect(() => applyMarkers('a // @constructor\n', ts, 'f.ts', on)).toThrow(MarkerError)
  })
  test('takes -- markers in .sql lines and blocks', () => {
    const sql = commentSyntaxFor('db/init.sql')
    expect(sql).toEqual(['--', ''])
    const src = 'a -- @auth\n-- @auth-start\nx\n-- @auth-end\ny\n'
    expect(applyMarkers(src, sql ?? ts, 'init.sql', on)).toBe('a\nx\ny\n')
    expect(applyMarkers(src, sql ?? ts, 'init.sql', off)).toBe('y\n')
  })
  test('takes # markers in a .conf file', () => {
    const conf = commentSyntaxFor('nginx/default.conf')
    expect(conf).toEqual(['#', ''])
    const src = 'a # @auth\n# @auth-start\nx\n# @auth-end\ny\n'
    expect(applyMarkers(src, conf ?? ts, 'default.conf', on)).toBe('a\nx\ny\n')
    expect(applyMarkers(src, conf ?? ts, 'default.conf', off)).toBe('y\n')
  })
})

describe('capability selections', () => {
  const chosen = { database: true, 'database:fake': true, 'database:other': false }
  const none = { database: false, 'database:fake': false, 'database:other': false }
  test('a provider line and block follow database:<provider>', () => {
    const src = 'a // @database:fake\n// @database:fake-start\nx\n// @database:fake-end\n'
    expect(applyMarkers(src, ts, 'f.ts', chosen)).toBe('a\nx\n')
    expect(applyMarkers(src, ts, 'f.ts', none)).toBe('')
    expect(applyMarkers(src, ts, 'f.ts', { ...chosen, 'database:fake': false })).toBe('')
  })
  test('@nodatabase and @nodatabase:fake negate the kind and the provider', () => {
    const src = 'a // @nodatabase\nb // @nodatabase:fake\n'
    expect(applyMarkers(src, ts, 'f.ts', none)).toBe('a\nb\n')
    expect(applyMarkers(src, ts, 'f.ts', chosen)).toBe('')
    expect(applyMarkers(src, ts, 'f.ts', { ...chosen, 'database:fake': false })).toBe('b\n')
  })
  test('a negated provider block is kept only without that provider', () => {
    const src = '// @nodatabase:fake-start\nx\n// @nodatabase:fake-end\n'
    expect(applyMarkers(src, ts, 'f.ts', none)).toBe('x\n')
    expect(applyMarkers(src, ts, 'f.ts', chosen)).toBe('')
  })
  test('an unlisted provider is an unknown marker name', () => {
    expect(() => applyMarkers('a // @database:nope\n', ts, 'f.ts', chosen)).toThrow(MarkerError)
  })
})

describe('findLeftoverMarker', () => {
  test('finds a marker in any comment syntax and ignores plain text', () => {
    expect(findLeftoverMarker('import x from "@auth/core"')).toBeNull()
    expect(findLeftoverMarker('x # @auth')).toBe('# @auth')
  })
  test('a -- marker is a leftover in a .sql file only', () => {
    expect(findLeftoverMarker('select 1 -- @x', commentSyntaxFor('a.sql'))).toBe('-- @x')
    expect(findLeftoverMarker('const a = 1 -- @x', commentSyntaxFor('a.ts'))).toBeNull()
    expect(findLeftoverMarker('select 1 -- @x')).toBeNull()
    expect(findLeftoverMarker('x // @x', commentSyntaxFor('a.sql'))).toBe('// @x')
  })
})

describe('commentSyntaxFor', () => {
  test('maps extensions and well-known basenames', () => {
    expect(commentSyntaxFor('a/b.ts')).toEqual(['//', ''])
    expect(commentSyntaxFor('a/Dockerfile')).toEqual(['#', ''])
    expect(commentSyntaxFor('a/.env.example')).toEqual(['#', ''])
    expect(commentSyntaxFor('a/README.md')).toEqual(['<!--', ' -->'])
    expect(commentSyntaxFor('a/logo.png')).toBeUndefined()
  })
})

describe('.jsonc and .astro (ADR 0014 K5)', () => {
  const slash = ['//', ''] as const
  const html = ['<!--', ' -->'] as const

  test('a .jsonc file takes // markers', () => {
    expect(commentSyntaxFor('wrangler.jsonc')).toEqual(slash)
    const src = '{\n  "a": 1, // @auth\n  // @auth-start\n  "b": 2,\n  // @auth-end\n  "c": 3\n}\n'
    expect(applyMarkers(src, slash, 'wrangler.jsonc', on)).toBe(
      '{\n  "a": 1,\n  "b": 2,\n  "c": 3\n}\n',
    )
    expect(applyMarkers(src, slash, 'wrangler.jsonc', off)).toBe('{\n  "c": 3\n}\n')
  })
  test('an .astro file takes both syntaxes', () => {
    expect(commentSyntaxesFor('a/page.astro')).toEqual([slash, html])
    expect(commentSyntaxesFor('a/b.ts')).toEqual([slash])
    expect(commentSyntaxFor('a/page.astro')).toEqual(slash)
  })
  test('both syntaxes work as lines and as blocks in one pass', () => {
    const src = [
      '---',
      'const a = 1 // @auth',
      '// @auth-start',
      'const b = 2',
      '// @auth-end',
      '---',
      '<p>a</p> <!-- @auth -->',
      '<!-- @noauth-start -->',
      '<p>b</p>',
      '<!-- @noauth-end -->',
      '',
    ].join('\n')
    const both = [slash, html] as const
    expect(applyMarkers(src, both, 'p.astro', on)).toBe(
      '---\nconst a = 1\nconst b = 2\n---\n<p>a</p>\n',
    )
    expect(applyMarkers(src, both, 'p.astro', off)).toBe('---\n---\n<p>b</p>\n')
  })
  test('a block opened in one syntax and closed in the other is unbalanced', () => {
    const src = '// @auth-start\nx\n<!-- @auth-end -->\n'
    expect(() => applyMarkers(src, [slash, html], 'p.astro', on)).not.toThrow()
    expect(() => applyMarkers('// @auth-start\nx\n', [slash, html], 'p.astro', on)).toThrow(
      MarkerError,
    )
  })
  test('the leftover sweep knows both syntaxes', () => {
    expect(findLeftoverMarker('<p>a</p> <!-- @x -->', commentSyntaxFor('p.astro'))).toBe('<!-- @x')
    expect(findLeftoverMarker('const a = 1 // @x', commentSyntaxFor('p.astro'))).toBe('// @x')
    expect(findLeftoverMarker('"a": 1 // @x', commentSyntaxFor('w.jsonc'))).toBe('// @x')
  })
  test('placeholders are processed in both file types', () => {
    expect(isTextFile('src/pages/index.astro')).toBe(true)
    expect(isTextFile('wrangler.jsonc')).toBe(true)
  })
})
