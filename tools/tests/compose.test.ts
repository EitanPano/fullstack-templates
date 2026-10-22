import { describe, expect, test } from 'bun:test'
import { parse } from 'yaml'
import { ComposeError, assembleCompose } from '../lib/compose'

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
