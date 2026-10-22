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
})
