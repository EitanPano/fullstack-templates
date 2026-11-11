import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'

import { DataTableComponent, type TableColumn } from './data-table.component'

interface Row {
  id: number
  name: string
}

const COLUMNS: TableColumn[] = [
  { key: 'name', labelKey: 'form.submit' },
  { key: 'id', labelKey: 'form.cancel', align: 'end' },
]

@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table [columns]="columns" [rows]="rows()" caption="modal.close">
      @if (custom()) {
        <ng-template #cell let-row let-column="column">{{ column.key }}={{ row.name }}</ng-template>
      }
      <p empty>Add one</p>
    </app-data-table>
  `,
})
class HostComponent {
  columns = COLUMNS
  rows = signal<Row[]>([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Grace' },
  ])
  custom = signal(false)
}

async function render() {
  TestBed.configureTestingModule({ providers: [provideTestTranslator()] })
  const fixture = TestBed.createComponent(HostComponent)
  await fixture.whenStable()
  const element = fixture.nativeElement as HTMLElement
  return { fixture, element, host: fixture.componentInstance }
}

describe('DataTableComponent', () => {
  it('renders a column header with scope and a translated label per column', async () => {
    const { element } = await render()
    const headers = [...element.querySelectorAll('th')]
    expect(headers.map((th) => th.textContent.trim())).toEqual(['Submit', 'Cancel'])
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    expect(headers[1].getAttribute('data-align')).toBe('end')
  })

  it('renders a row per item and the cell value by key', async () => {
    const { element } = await render()
    const rows = [...element.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    expect([...rows[0].querySelectorAll('td')].map((td) => td.textContent.trim())).toEqual([
      'Ada',
      '1',
    ])
  })

  it('renders every cell through the cell template when one is given', async () => {
    const { fixture, element, host } = await render()
    host.custom.set(true)
    await fixture.whenStable()
    const cells = [...element.querySelectorAll('tbody tr:first-child td')]
    expect(cells.map((td) => td.textContent.trim())).toEqual(['name=Ada', 'id=Ada'])
  })

  it('hides the caption visually but keeps it for screen readers', async () => {
    const { element } = await render()
    const caption = element.querySelector('caption') as HTMLElement
    expect(caption.textContent.trim()).toBe('Close')
    expect(caption.classList.contains('visually-hidden')).toBe(true)
    expect(element.querySelector('.data-table')?.getAttribute('aria-label')).toBe(
      'Close',
    )
  })

  it('shows the empty state and the projected action instead of the table without rows', async () => {
    const { fixture, element, host } = await render()
    host.rows.set([])
    await fixture.whenStable()
    expect(element.querySelector('table')).toBeNull()
    expect(element.querySelector('app-empty-state h2')?.textContent).toBe('Nothing to show yet')
    expect(element.querySelector('.empty-state__actions')?.textContent).toContain('Add one')
  })
})
