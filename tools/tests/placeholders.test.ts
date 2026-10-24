import { describe, expect, test } from 'bun:test'
import { COMMENT_BASENAMES, COMMENT_EXTENSIONS, commentSyntaxFor } from '../lib/markers'
import {
  findLeftoverPlaceholder,
  isTextFile,
  substitutePlaceholders,
  toProjectName,
} from '../lib/placeholders'

describe('toProjectName', () => {
  test('sanitises', () => {
    expect(toProjectName('My App!')).toBe('my-app')
    expect(toProjectName('  ')).toBe('app')
    expect(toProjectName('Ünïcode name')).toBe('n-code-name')
    expect(toProjectName('ok-name')).toBe('ok-name')
  })
})

describe('substitutePlaceholders', () => {
  test('replaces declared tokens everywhere and leaves others', () => {
    expect(
      substitutePlaceholders('__PROJECT_NAME__-api __PROJECT_NAME__ __dirname __PURE__', {
        PROJECT_NAME: 'demo',
      }),
    ).toBe('demo-api demo __dirname __PURE__')
  })
})

describe('findLeftoverPlaceholder', () => {
  test('reports only declared names', () => {
    expect(findLeftoverPlaceholder('x __PROJECT_NAME__', ['PROJECT_NAME'])).toBe('__PROJECT_NAME__')
    expect(findLeftoverPlaceholder('x __OTHER__', ['PROJECT_NAME'])).toBeNull()
  })
})

describe('isTextFile', () => {
  test('by extension and basename', () => {
    expect(isTextFile('a/b.ts')).toBe(true)
    expect(isTextFile('a/Dockerfile')).toBe(true)
    expect(isTextFile('a/default.conf')).toBe(true)
    expect(isTextFile('a/.env.example')).toBe(true)
    expect(isTextFile('a/logo.png')).toBe(false)
    expect(isTextFile('a/bun.lock')).toBe(true)
  })

  test('every file type with a comment syntax is a text file', () => {
    for (const ext of COMMENT_EXTENSIONS) {
      expect(commentSyntaxFor(`a/b${ext}`)).toBeDefined()
      expect(isTextFile(`a/b${ext}`)).toBe(true)
    }
    for (const name of COMMENT_BASENAMES) expect(isTextFile(`a/${name}`)).toBe(true)
    expect(isTextFile('a/App.vue')).toBe(true)
    expect(isTextFile('a/run.sh')).toBe(true)
  })
})
