import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import {
  PinError,
  blobId,
  checkPins,
  pinCapability,
  shadowedPaths,
  type GitRunner,
} from '../lib/pins'
import { copyFixture, tempDir } from './helpers'

const TARGET = 'server/mini/database/fake'
const CAPABILITY = 'server/mini/capabilities/database/fake/capability.yaml'

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

function overlayOf(root: string) {
  const catalog = loadCatalog(root)
  const template = catalog.templates.get('server/mini')!
  return { catalog, template, overlay: template.overlays.get('database/fake')! }
}

function editCapability(root: string, change: (text: string) => string): void {
  const file = path.join(root, CAPABILITY)
  writeFileSync(file, change(readFileSync(file, 'utf8')))
}

// A fixture catalog with its pins rewritten from the current files.
function pinnedFixture(): string {
  const root = copyFixture('catalog')
  pinCapability(loadCatalog(root), TARGET, () => undefined)
  return root
}

describe('blobId', () => {
  test('equals git hash-object for an LF file and for the same content with CRLF', () => {
    const dir = tempDir()
    const lf = 'one\ntwo\n'
    const file = path.join(dir, 'f.txt')
    writeFileSync(file, lf)
    const expected = git(dir, 'hash-object', '--no-filters', file)
    expect(blobId(lf)).toBe(expected)
    expect(blobId(lf.replaceAll('\n', '\r\n'))).toBe(expected)
  })
})

describe('shadowedPaths', () => {
  test('holds the overlay files that exist in base, not overlay-only or onlyPaths files', () => {
    const { template, overlay } = overlayOf(copyFixture('catalog'))
    expect(shadowedPaths(template, overlay)).toEqual(['src/auth.ts', 'src/index.ts'])
  })
})

describe('checkPins', () => {
  test('passes a correct set', () => {
    expect(checkPins(loadCatalog(pinnedFixture()))).toEqual([])
  })

  test('fails a shadowed file without a pin, naming the capability and the path', () => {
    const root = pinnedFixture()
    editCapability(root, (text) => text.replace(/^ {2}src\/index\.ts: .*\n/m, ''))
    const problems = checkPins(loadCatalog(root))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('server/mini/capabilities/database/fake')
    expect(problems[0]).toContain('src/index.ts')
    expect(problems[0]).toContain('no pin')
  })

  test('fails a pin for a path that is not shadowed', () => {
    const root = pinnedFixture()
    editCapability(root, (text) => `${text}  src/database.ts: ${'a'.repeat(40)}\n`)
    const problems = checkPins(loadCatalog(root))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('src/database.ts')
    expect(problems[0]).toContain('not shadowed')
  })

  test('fails a stale pin with the --pin hint', () => {
    const root = pinnedFixture()
    writeFileSync(path.join(root, 'server/mini/base/src/auth.ts'), 'export const changed = 1\n')
    const problems = checkPins(loadCatalog(root))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('src/auth.ts')
    expect(problems[0]).toContain('base changed since the overlay was reconciled')
    expect(problems[0]).toContain(`bun tools/validate.ts --pin ${TARGET}`)
  })
})

describe('pinCapability', () => {
  test('rewrites only the pins map, keeps comments and prints a diff when the old blob exists', () => {
    const root = pinnedFixture()
    editCapability(root, (text) => `# top comment\n${text.replace('summary:', '# why\nsummary:')}`)
    git(root, 'init', '-q')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', 'init')
    const before = readFileSync(path.join(root, CAPABILITY), 'utf8')
    writeFileSync(path.join(root, 'server/mini/base/src/auth.ts'), 'export const changed = 1\n')
    const lines: string[] = []
    pinCapability(loadCatalog(root), TARGET, (line) => lines.push(line))
    const after = readFileSync(path.join(root, CAPABILITY), 'utf8')
    expect(after).toContain('# top comment')
    expect(after).toContain('# why')
    expect(after.slice(0, after.indexOf('pins:'))).toBe(before.slice(0, before.indexOf('pins:')))
    expect(after).toContain(`src/auth.ts: ${blobId('export const changed = 1\n')}`)
    expect(checkPins(loadCatalog(root))).toEqual([])
    const output = lines.join('\n')
    expect(output).toContain('src/auth.ts')
    expect(output).toContain('-export')
    expect(output).toContain('+export const changed = 1')
    expect(output).not.toContain('src/index.ts')
  })

  test('says the old blob is not in history when git does not hold it', () => {
    const root = pinnedFixture()
    git(root, 'init', '-q')
    editCapability(root, (text) =>
      text.replace(/(src\/auth\.ts: )[0-9a-f]{40}/, `$1${'b'.repeat(40)}`),
    )
    const lines: string[] = []
    pinCapability(loadCatalog(root), TARGET, (line) => lines.push(line))
    expect(lines.join('\n')).toMatch(/src\/auth\.ts.*not in (the repository's )?history/)
  })

  describe('when git misbehaves', () => {
    const stale = () => {
      const root = pinnedFixture()
      editCapability(root, (text) =>
        text.replace(/(src\/auth\.ts: )[0-9a-f]{40}/, `$1${'b'.repeat(40)}`),
      )
      return root
    }
    const run = (runGit: GitRunner) => {
      const lines: string[] = []
      pinCapability(loadCatalog(stale()), TARGET, (line) => lines.push(line), runGit)
      return lines.join('\n')
    }
    const ok = { status: 0, out: '', err: '' }

    test('a missing git binary is reported as such, not as a missing blob', () => {
      const output = run(() => ({ status: null, out: '', err: '' }))
      expect(output).toContain('src/auth.ts: git is not available')
      expect(output).not.toContain('not in history')
    })
    test('a failed hash-object is reported with git stderr', () => {
      const output = run((_cwd, args) =>
        args[0] === 'hash-object' ? { status: 128, out: '', err: 'fatal: read-only\n' } : ok,
      )
      expect(output).toContain('git hash-object failed (exit 128: fatal: read-only)')
    })
    test('a failed diff is reported', () => {
      const output = run((_cwd, args) =>
        args[0] === 'diff' ? { status: 129, out: '', err: 'usage\n' } : { ...ok, out: 'abc\n' },
      )
      expect(output).toContain('git diff failed (exit 129: usage)')
    })
  })

  test('refuses an unknown capability with the known ones', () => {
    const catalog = loadCatalog(copyFixture('catalog'))
    expect(() => pinCapability(catalog, 'server/mini/database/nope', () => undefined)).toThrow(
      PinError,
    )
    expect(() => pinCapability(catalog, 'server/mini/database/nope', () => undefined)).toThrow(
      TARGET,
    )
  })
})
