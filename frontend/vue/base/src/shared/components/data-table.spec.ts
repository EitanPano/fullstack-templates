import { screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import { renderWithApp } from '@/testing/render'

import DataTable from './data-table.vue'

const COLUMNS = [
  { key: 'name', labelKey: 'nav.home' },
  { key: 'count', labelKey: 'nav.open', align: 'end' as const },
]
const ROWS = [
  { name: 'Alpha', count: 2 },
  { name: 'Beta', count: 3 },
]

describe('DataTable', () => {
  it('renders a header per column and a row per item', async () => {
    await renderWithApp(DataTable, { props: { columns: COLUMNS, rows: ROWS } })

    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Home', 'Open navigation'])
    expect(within(table).getAllByRole('columnheader')[0]).toHaveAttribute('scope', 'col')
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByRole('cell', { name: 'Alpha' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: '3' })).toHaveAttribute('data-align', 'end')
  })

  it('names the region and the table by the caption, visible only on request', async () => {
    const view = await renderWithApp(DataTable, { props: { columns: COLUMNS, rows: ROWS } })

    const region = screen.getByRole('region', { name: 'Table' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(view.container.querySelector('caption')).toHaveClass('visually-hidden')

    await view.rerender({ captionVisible: true })
    expect(view.container.querySelector('caption')).not.toHaveClass('visually-hidden')
  })

  it('takes another caption key', async () => {
    await renderWithApp(DataTable, {
      props: { columns: COLUMNS, rows: ROWS, captionKey: 'nav.primary' },
    })

    expect(screen.getByRole('region', { name: 'Primary' })).toBeInTheDocument()
  })

  it('shows a plain value as text and nothing for a non-plain one', async () => {
    await renderWithApp(DataTable, {
      props: { columns: COLUMNS, rows: [{ name: { nested: true }, count: true }] },
    })

    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('')
    expect(cells[1]).toHaveTextContent('true')
  })

  it('renders the cell slot for every cell when given', async () => {
    await renderWithApp(DataTable, {
      props: { columns: COLUMNS, rows: ROWS },
      slots: {
        cell: ({ row, column }: { row: { name: string }; column: { key: string } }) =>
          `${column.key}=${row.name}`,
      },
    })

    expect(screen.getByRole('cell', { name: 'name=Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'count=Beta' })).toBeInTheDocument()
  })

  it('shows an empty state in place of the table when there are no rows', async () => {
    await renderWithApp(DataTable, {
      props: { columns: COLUMNS, rows: [] },
      slots: { empty: '<button>Add one</button>' },
    })

    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Nothing to show yet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
  })

  it('takes another empty key', async () => {
    await renderWithApp(DataTable, {
      props: { columns: COLUMNS, rows: [], emptyKey: 'notFound.title' },
    })

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
