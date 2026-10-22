import { describe, expect, test } from 'bun:test'
import { MarkerError, applyMarkers, commentSyntaxFor, findLeftoverMarker } from '../lib/markers'

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
})

describe('findLeftoverMarker', () => {
  test('finds a marker in any comment syntax and ignores plain text', () => {
    expect(findLeftoverMarker('import x from "@auth/core"')).toBeNull()
    expect(findLeftoverMarker('x # @auth')).toBe('# @auth')
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
