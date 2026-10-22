import { describe, expect, test } from 'bun:test'
import { validateAgainst } from '../lib/schema'

const template = {
  schemaVersion: 1,
  id: 'bun-express',
  kind: 'server',
  name: 'Express 5 on Bun',
  version: '1.0.0',
  summary: 'one line',
  runtime: { language: 'typescript', platform: 'bun', minVersion: '1.4' },
  tools: [{ name: 'bun', min: '1.4' }],
  placeholders: ['PROJECT_NAME'],
  flags: {
    auth: {
      summary: 'accounts',
      default: true,
      onlyPaths: ['src/api/auth'],
      dependencies: { remove: ['jose'] },
    },
  },
  dependencies: { manifest: 'package.json', adapter: 'npm' },
  commands: { install: 'bun install', check: 'bun run check' },
  contract: { produces: 'openapi.json' },
  http: { port: 4000, health: '/api/health', ready: '/api/health/ready' },
  gitignore: ['node'],
  agents: 'AGENTS.md',
  postGenerate: ['install', 'contract'],
}

describe('validateAgainst', () => {
  test('accepts a complete template manifest', () => {
    expect(validateAgainst('template', template)).toEqual([])
  })
  test('requires commands.check', () => {
    expect(
      validateAgainst('template', { ...template, commands: { install: 'bun install' } }),
    ).toContainEqual("/commands must have required property 'check'")
  })
  test('rejects an unknown command name', () => {
    expect(
      validateAgainst('template', { ...template, commands: { ...template.commands, build: 'x' } }),
    ).not.toEqual([])
  })
  test('rejects a contract that both produces and consumes', () => {
    expect(
      validateAgainst('template', { ...template, contract: { produces: 'a', consumes: 'b' } }),
    ).not.toEqual([])
  })
  test('rejects a postGenerate entry that is not a command name', () => {
    expect(validateAgainst('template', { ...template, postGenerate: ['deploy'] })).not.toEqual([])
  })
  test('accepts an index and rejects a multi-line summary', () => {
    const index = {
      schemaVersion: 1,
      templates: [
        {
          id: 'bun-express',
          kind: 'server',
          path: 'server/bun-express',
          version: '1.0.0',
          summary: 'one line',
        },
      ],
      stacks: [{ id: 'next-bun-express', path: 'stacks/next-bun-express', summary: 'one line' }],
    }
    expect(validateAgainst('index', index)).toEqual([])
    expect(
      validateAgainst('index', {
        ...index,
        stacks: [{ ...index.stacks[0], summary: 'two\nlines' }],
      }),
    ).not.toEqual([])
  })
  test('accepts a stack, a cases file and a provenance record', () => {
    expect(
      validateAgainst('stack', {
        schemaVersion: 1,
        id: 'next-bun-express',
        summary: 's',
        packages: [{ template: 'server/bun-express', dir: 'backend' }],
      }),
    ).toEqual([])
    expect(
      validateAgainst('cases', {
        schemaVersion: 1,
        cases: [
          { name: 'default' },
          { name: 'auth-off', flags: { auth: false } },
          { name: 'in-stack', stack: 'next-bun-express' },
        ],
      }),
    ).toEqual([])
    expect(
      validateAgainst('provenance', {
        schemaVersion: 1,
        catalog: { repository: 'r', version: 'v0.1.0', commit: null },
        generatedAt: '2026-10-22T10:00:00Z',
        stack: 'next-bun-express',
        packages: {
          backend: {
            template: 'server/bun-express',
            version: '1.0.0',
            flags: { auth: true },
            capabilities: {},
            commands: { check: 'bun run check' },
            http: { port: 4000, health: '/api/health' },
          },
        },
        providers: {},
        answers: { projectName: 'demo' },
      }),
    ).toEqual([])
  })
})

describe('validateAgainst negatives', () => {
  const stack = {
    schemaVersion: 1,
    id: 'next-bun-express',
    summary: 's',
    packages: [{ template: 'server/bun-express', dir: 'backend' }],
  }
  const provenance = {
    schemaVersion: 1,
    catalog: { repository: 'r', version: 'v0.1.0', commit: null },
    generatedAt: '2026-10-22T10:00:00Z',
    stack: null,
    packages: {},
    providers: {},
    answers: { projectName: 'demo' },
  }

  test('rejects a template id that breaks the pattern', () => {
    const errors = validateAgainst('template', { ...template, id: 'Bun_Express' })
    expect(errors).toContainEqual(expect.stringMatching(/^\/id must match pattern/))
  })
  test('rejects a template version that is not semver', () => {
    const errors = validateAgainst('template', { ...template, version: '1.0' })
    expect(errors).toContainEqual(expect.stringMatching(/^\/version must match pattern/))
  })
  test('rejects a placeholder that is not SCREAMING_SNAKE_CASE', () => {
    const errors = validateAgainst('template', { ...template, placeholders: ['projectName'] })
    expect(errors).toContainEqual(expect.stringMatching(/^\/placeholders\/0 must match pattern/))
  })
  test('rejects an unknown template property', () => {
    const errors = validateAgainst('template', { ...template, extra: true })
    expect(errors).toContainEqual('/ must NOT have additional properties')
  })
  test('rejects an out-of-range http port', () => {
    const errors = validateAgainst('template', {
      ...template,
      http: { port: 70000, health: '/h' },
    })
    expect(errors).toContainEqual('/http/port must be <= 65535')
  })
  test('rejects a capability kind that is not database, cache or messaging', () => {
    const errors = validateAgainst('template', {
      ...template,
      capabilities: { queue: { providers: ['x'] } },
    })
    expect(errors).toContainEqual('/capabilities property name must be valid')
  })
  test('rejects a stack without packages', () => {
    const errors = validateAgainst('stack', { ...stack, packages: [] })
    expect(errors).toContainEqual('/packages must NOT have fewer than 1 items')
  })
  test('rejects a stack package dir that breaks the pattern', () => {
    const errors = validateAgainst('stack', {
      ...stack,
      packages: [{ template: 'server/bun-express', dir: 'Back_End' }],
    })
    expect(errors).toContainEqual(expect.stringMatching(/^\/packages\/0\/dir must match pattern/))
  })
  test('rejects a provenance record missing a required field', () => {
    const rest: Record<string, unknown> = { ...provenance }
    delete rest.answers
    expect(validateAgainst('provenance', rest)).toContainEqual(
      "/ must have required property 'answers'",
    )
  })
  test('rejects duplicate case names', () => {
    const errors = validateAgainst('cases', {
      schemaVersion: 1,
      cases: [{ name: 'default' }, { name: 'default' }],
    })
    expect(errors).toContainEqual(expect.stringContaining('/cases/1/name'))
  })
  test('does not crash on a non-array cases value', () => {
    const errors = validateAgainst('cases', { schemaVersion: 1, cases: 'nope' })
    expect(errors).toContainEqual('/cases must be array')
    expect(errors.some((e) => e.includes('must be unique'))).toBe(false)
  })

  test.each([
    ['onlyPaths', { flags: { auth: { summary: 's', default: true, onlyPaths: ['../x'] } } }],
    ['agents', { agents: '/abs' }],
    ['agents', { agents: 'C:/x' }],
    ['dependencies.manifest', { dependencies: { manifest: 'a/../b', adapter: 'npm' } }],
    ['contract.produces', { contract: { produces: '../openapi.json' } }],
    ['gitignore', { gitignore: ['../x'] }],
    ['command', { commands: { check: 'bun run a | tee b' } }],
    ['command', { commands: { check: 'echo $HOME' } }],
    ['postGenerate', { postGenerate: ['dev'] }],
    ['reserved flag', { flags: { server: { summary: 's', default: true } } }],
  ])('rejects an unsafe template manifest value: %s', (_label, patch) => {
    expect(validateAgainst('template', { ...template, ...patch })).not.toEqual([])
  })
  test('rejects index and stack paths outside the layout', () => {
    const entry = { id: 'x', kind: 'server', path: '../x', version: '1.0.0', summary: 's' }
    expect(
      validateAgainst('index', { schemaVersion: 1, templates: [entry], stacks: [] }),
    ).not.toEqual([])
    expect(
      validateAgainst('index', {
        schemaVersion: 1,
        templates: [],
        stacks: [{ id: 'x', path: 'other/x', summary: 's' }],
      }),
    ).not.toEqual([])
    expect(
      validateAgainst('stack', {
        schemaVersion: 1,
        id: 'x',
        summary: 's',
        packages: [{ template: '../x', dir: 'backend' }],
      }),
    ).not.toEqual([])
  })
  test('rejects an empty cases list', () => {
    expect(validateAgainst('cases', { schemaVersion: 1, cases: [] })).not.toEqual([])
  })
  test.each(['src/db/x', 'lib/ui', 'db', 'package.json', '.github/x', 'a..b/c'])(
    'accepts the relative path %s',
    (agents) => {
      expect(validateAgainst('template', { ...template, agents })).toEqual([])
    },
  )
  test.each(['../x', 'a/../b', '/abs', 'C:/x', 'a/..', '..'])(
    'rejects the relative path %s',
    (agents) => {
      expect(validateAgainst('template', { ...template, agents })).not.toEqual([])
    },
  )
})

describe('provider and capability manifests', () => {
  const provider = {
    schemaVersion: 1,
    kind: 'database',
    id: 'postgres',
    name: 'PostgreSQL',
    service: 'database',
    compose: 'compose.yaml',
    env: [
      {
        name: 'DATABASE_URL',
        summary: 'connection string',
        local: 'postgres://localhost:5432/app',
        compose: 'postgres://database:5432/app',
        test: 'postgres://localhost:5432/app_test',
      },
    ],
    files: ['db/init.sql'],
  }
  const capability = {
    schemaVersion: 1,
    kind: 'database',
    provider: 'postgres',
    summary: 'PostgreSQL through Drizzle',
    dependencies: { add: { dependencies: { pg: '^8' } }, remove: [] },
    scripts: { 'test:db': 'bun test ./tests/db', 'db:migrate': 'bun ./src/migrate.ts' },
    commands: { testDb: 'bun run test:db', migrate: 'bun run db:migrate' },
  }

  test('accepts a provider and a capability manifest', () => {
    expect(validateAgainst('provider', provider)).toEqual([])
    expect(validateAgainst('provider', { ...provider, env: [], files: undefined })).toEqual([])
    expect(validateAgainst('capability', capability)).toEqual([])
    expect(
      validateAgainst('capability', {
        schemaVersion: 1,
        kind: 'cache',
        provider: 'redis',
        summary: 's',
      }),
    ).toEqual([])
  })
  test('rejects a provider missing a required field', () => {
    const rest: Record<string, unknown> = { ...provider }
    delete rest.service
    expect(validateAgainst('provider', rest)).toContainEqual(
      "/ must have required property 'service'",
    )
  })
  test('rejects a capability missing a required field', () => {
    const rest: Record<string, unknown> = { ...capability }
    delete rest.summary
    expect(validateAgainst('capability', rest)).toContainEqual(
      "/ must have required property 'summary'",
    )
  })
  test('rejects a kind outside the capability kinds', () => {
    expect(validateAgainst('provider', { ...provider, kind: 'queue' })).not.toEqual([])
    expect(validateAgainst('capability', { ...capability, kind: 'queue' })).not.toEqual([])
  })
  test('rejects a provider env name that is not SCREAMING_SNAKE_CASE', () => {
    const env = [{ ...provider.env[0], name: 'databaseUrl' }]
    expect(validateAgainst('provider', { ...provider, env })).toContainEqual(
      expect.stringMatching(/^\/env\/0\/name must match pattern/),
    )
  })
  test('rejects a provider env entry without a test value', () => {
    const entry: Record<string, unknown> = { ...provider.env[0] }
    delete entry.test
    expect(validateAgainst('provider', { ...provider, env: [entry] })).not.toEqual([])
  })
  test('rejects a provider file path that escapes the directory', () => {
    expect(validateAgainst('provider', { ...provider, files: ['../x'] })).not.toEqual([])
  })
  test('rejects a multi-line summary', () => {
    expect(validateAgainst('capability', { ...capability, summary: 'a\nb' })).not.toEqual([])
    const env = [{ ...provider.env[0], summary: 'a\nb' }]
    expect(validateAgainst('provider', { ...provider, env })).not.toEqual([])
  })
  test('rejects a commands key outside the vocabulary', () => {
    expect(
      validateAgainst('capability', { ...capability, commands: { build: 'bun x' } }),
    ).not.toEqual([])
  })
  test('rejects a command with shell syntax', () => {
    expect(
      validateAgainst('capability', { ...capability, commands: { testDb: 'bun a | cat' } }),
    ).not.toEqual([])
  })
  test('rejects a script name with a space', () => {
    expect(
      validateAgainst('capability', { ...capability, scripts: { 'test db': 'bun x' } }),
    ).not.toEqual([])
  })
  test('rejects an empty script line', () => {
    expect(
      validateAgainst('capability', { ...capability, scripts: { 'test:db': '' } }),
    ).not.toEqual([])
  })
  test('rejects an unknown capability field', () => {
    expect(validateAgainst('capability', { ...capability, extra: 1 })).not.toEqual([])
  })
  test('provenance providers maps a kind to a provider id', () => {
    const record = {
      schemaVersion: 1,
      catalog: { repository: 'r', version: 'v0.1.0', commit: null },
      generatedAt: '2026-10-22T10:00:00Z',
      stack: null,
      packages: {},
      providers: { database: 'postgres' },
      answers: { projectName: 'demo' },
    }
    expect(validateAgainst('provenance', record)).toEqual([])
    expect(validateAgainst('provenance', { ...record, providers: { database: {} } })).not.toEqual(
      [],
    )
  })
})
