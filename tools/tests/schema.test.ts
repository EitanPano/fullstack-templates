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
    ).toContainEqual(expect.stringContaining('check'))
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
