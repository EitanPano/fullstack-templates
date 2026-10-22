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
  test('renders the header, cells and row order', () => {
    const matrix = renderMatrix(loadCatalog(FIXTURE))
    const lines = matrix.split('\n')
    expect(lines[0]).toBe('| Template | Kind | Version | Flags | Capabilities | Summary |')
    const mini = lines
      .find((l) => l.startsWith('| `mini` |'))
      ?.split('|')
      .map((c) => c.trim())
    const ui = lines
      .find((l) => l.startsWith('| `mini-ui` |'))
      ?.split('|')
      .map((c) => c.trim())
    expect(mini?.[4]).toBe('auth')
    expect(mini?.[5]).toBe('—')
    expect(ui?.[4]).toBe('—')
    expect(matrix.indexOf('| `mini` | server')).toBeLessThan(
      matrix.indexOf('| `mini-ui` | frontend'),
    )
  })
  test('replaces between markers and rejects a README without them', () => {
    const readme = `# x\n\n${MATRIX_START}\nold\n${MATRIX_END}\n\ntail\n`
    expect(replaceMatrix(readme, 'new')).toBe(
      `# x\n\n${MATRIX_START}\nnew\n${MATRIX_END}\n\ntail\n`,
    )
    expect(() => replaceMatrix('# x\n', 'new')).toThrow(ReadmeError)
  })
})
