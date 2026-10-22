import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { MATRIX_END, MATRIX_START, ReadmeError, renderMatrix, replaceMatrix } from '../lib/readme'
import { FIXTURE } from './helpers'

describe('readme matrix', () => {
  test('renders one row per template and per stack', () => {
    const matrix = renderMatrix(loadCatalog(FIXTURE))
    expect(matrix).toContain('| `mini` | server |')
    expect(matrix).toContain('| `mini-ui` | frontend |')
    expect(matrix).toContain('auth')
    expect(matrix).toContain('| `mini` | `server/mini`, `frontend/mini-ui` |')
  })
  test('replaces between markers and rejects a README without them', () => {
    const readme = `# x\n\n${MATRIX_START}\nold\n${MATRIX_END}\n\ntail\n`
    expect(replaceMatrix(readme, 'new')).toBe(
      `# x\n\n${MATRIX_START}\nnew\n${MATRIX_END}\n\ntail\n`,
    )
    expect(() => replaceMatrix('# x\n', 'new')).toThrow(ReadmeError)
  })
})
