import { describe, expect, test } from 'bun:test'
import { parse } from 'yaml'
import {
  ComposeError,
  addProvider,
  assembleCompose,
  deriveMigrate,
  wireConsumer,
  type ProviderEnvWiring,
} from '../lib/compose'

const skeleton = 'name: demo\n\n# Infrastructure services have no profile.\nservices: {}\n'

describe('assembleCompose', () => {
  test('keys each fragment by service name and keeps comments', () => {
    const out = assembleCompose(skeleton, [
      {
        service: 'backend',
        text: 'build: ./backend\n# loopback only\nports:\n  - "127.0.0.1:4000:4000"\nprofiles: ["app"]\n',
      },
      {
        service: 'frontend',
        text: 'build: ./frontend\ndepends_on: [backend]\nprofiles: ["app"]\n',
      },
    ])
    const doc = parse(out)
    expect(Object.keys(doc.services)).toEqual(['backend', 'frontend'])
    expect(doc.services.frontend.depends_on).toEqual(['backend'])
    expect(out).toContain('# loopback only')
    expect(out).toContain('# Infrastructure services have no profile.')
  })
  test('rejects a fragment that is not a mapping', () => {
    expect(() => assembleCompose(skeleton, [{ service: 'x', text: '- a\n' }])).toThrow(ComposeError)
  })
  test('rejects a fragment with a YAML syntax error, naming the service', () => {
    expect(() => assembleCompose(skeleton, [{ service: 'db', text: 'build: [\n' }])).toThrow(/db/)
    expect(() => assembleCompose(skeleton, [{ service: 'db', text: 'build: [\n' }])).toThrow(
      ComposeError,
    )
  })
  test('rejects a duplicate service name', () => {
    const fragment = { service: 'db', text: 'image: postgres\n' }
    expect(() => assembleCompose(skeleton, [fragment, fragment])).toThrow(ComposeError)
  })
  test('creates services when the skeleton has none', () => {
    const out = assembleCompose('name: demo\n', [{ service: 'db', text: 'image: postgres\n' }])
    expect(parse(out).services.db.image).toBe('postgres')
  })
})

const wiring: ProviderEnvWiring = {
  service: 'database',
  env: [
    { name: 'DATABASE_URL', compose: 'fake://database:5432/app', secret: true },
    { name: 'POOL_SIZE', compose: '5' },
  ],
}
const providerText =
  'services:\n  database:\n    image: fake-db:1\n    volumes:\n      - database-data:/var\nvolumes:\n  database-data: {}\n'

describe('wireConsumer', () => {
  test('adds environment and depends_on to a fragment, keeping its content', () => {
    const out = wireConsumer(
      'backend',
      'build: ./backend\n# keep\nenvironment:\n  PORT: "4000"\nprofiles: [app]\n',
      [wiring],
    )
    const doc = parse(out)
    expect(doc.environment).toEqual({
      PORT: '4000',
      DATABASE_URL: '${DATABASE_URL-}',
      POOL_SIZE: '${POOL_SIZE:-5}',
    })
    expect(doc.depends_on).toEqual({ database: { condition: 'service_healthy' } })
    expect(out).toContain('# keep')
  })
  test('creates environment when absent and merges into an existing depends_on mapping', () => {
    const doc = parse(
      wireConsumer('backend', 'build: .\ndepends_on:\n  cache:\n    condition: service_started\n', [
        wiring,
      ]),
    )
    expect(doc.environment.DATABASE_URL).toBe('${DATABASE_URL-}')
    expect(doc.environment.POOL_SIZE).toBe('${POOL_SIZE:-5}')
    expect(doc.depends_on).toEqual({
      cache: { condition: 'service_started' },
      database: { condition: 'service_healthy' },
    })
  })
  test('refuses a list-form environment', () => {
    expect(() => wireConsumer('backend', 'environment:\n  - A=1\n', [wiring])).toThrow(
      /backend.*environment.*mapping/,
    )
    expect(() => wireConsumer('backend', 'environment:\n  - A=1\n', [wiring])).toThrow(ComposeError)
  })
  test('refuses a list-form depends_on', () => {
    expect(() => wireConsumer('backend', 'depends_on: [cache]\n', [wiring])).toThrow(
      /backend.*depends_on.*mapping/,
    )
  })
})

describe('addProvider', () => {
  test('merges the service and the volumes into the document', () => {
    const out = addProvider(skeleton, 'database', providerText, () => undefined)
    const doc = parse(out)
    expect(doc.services.database.image).toBe('fake-db:1')
    expect(doc.volumes).toEqual({ 'database-data': {} })
    expect(out).toContain('# Infrastructure services have no profile.')
  })
  test('keeps an existing service and logs it on a rerun', () => {
    const first = addProvider(skeleton, 'database', providerText, () => undefined)
    const lines: string[] = []
    const again = addProvider(
      first.replace('fake-db:1', 'edited:2'),
      'database',
      providerText,
      (l) => lines.push(l),
    )
    expect(parse(again).services.database.image).toBe('edited:2')
    expect(lines).toEqual(['docker-compose.yml already has service database; kept'])
  })
  test('keeps a volume that is already present', () => {
    const base = 'name: d\nservices: {}\nvolumes:\n  database-data:\n    driver: local\n'
    expect(parse(addProvider(base, 'database', providerText, () => undefined)).volumes).toEqual({
      'database-data': { driver: 'local' },
    })
  })
  test('refuses a provider document with another top-level key', () => {
    const text = providerText + 'networks: {}\n'
    expect(() => addProvider(skeleton, 'database', text, () => undefined)).toThrow(/networks/)
    expect(() => addProvider(skeleton, 'database', text, () => undefined)).toThrow(ComposeError)
  })
  test('refuses a provider document that lacks its declared service', () => {
    expect(() => addProvider(skeleton, 'cache', providerText, () => undefined)).toThrow(/cache/)
  })
})

describe('deriveMigrate', () => {
  const consumer = wireConsumer(
    'backend',
    'build: ./backend\n# keep\nenvironment:\n  PORT: "4000"\nports: ["127.0.0.1:4000:4000"]\nprofiles: [app]\ndepends_on:\n  cache:\n    condition: service_started\n',
    [wiring],
  )
  const command = 'bun run src/infra/scripts/migrate.ts'

  test('derives a one-shot service with the same build and wired environment', () => {
    const { migrate } = deriveMigrate('backend', consumer, command, 'database')
    expect(parse(migrate)).toEqual({
      build: './backend',
      environment: {
        PORT: '4000',
        DATABASE_URL: '${DATABASE_URL-}',
        POOL_SIZE: '${POOL_SIZE:-5}',
      },
      command,
      restart: 'no',
      profiles: ['app'],
      depends_on: { database: { condition: 'service_healthy' } },
    })
    expect(migrate).toContain('restart: "no"')
  })

  test('makes the package wait for the completed migration and keeps its other conditions', () => {
    const out = deriveMigrate('backend', consumer, command, 'database')
    expect(parse(out.consumer).depends_on).toEqual({
      cache: { condition: 'service_started' },
      database: { condition: 'service_healthy' },
      'backend-migrate': { condition: 'service_completed_successfully' },
    })
    expect(out.consumer).toContain('# keep')
    expect(parse(out.consumer).ports).toEqual(['127.0.0.1:4000:4000'])
  })

  test('refuses a list-form depends_on', () => {
    expect(() => deriveMigrate('backend', 'build: .\ndepends_on: [cache]\n', command, 'd')).toThrow(
      ComposeError,
    )
  })
})
