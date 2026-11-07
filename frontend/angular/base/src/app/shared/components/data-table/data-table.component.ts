import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, TemplateRef, contentChild, input } from '@angular/core'

import { TranslatePipe } from '../../pipes/translate.pipe'
import { EmptyStateComponent } from '../empty-state/empty-state.component'

export interface TableColumn {
  readonly key: string
  readonly labelKey: string
  readonly align?: 'start' | 'center' | 'end'
}

// What a cell template receives: `let-row` (the row), `let-column="column"` (the column).
export interface TableCellContext<T> {
  $implicit: T
  row: T
  column: TableColumn
}

// A read-only table: one header per column (`scope="col"`), one row per item, a caption for screen
// readers (visible with `captionVisible`), and an empty state in place of the body when there are
// no rows. A cell shows `row[column.key]` unless the content holds `<ng-template #cell let-row
// let-column="column">`, which then renders every cell. The table scrolls sideways inside its own
// container, so a wide table never widens the page. `caption` and `emptyKey` are keys.
@Component({
  selector: 'app-data-table',
  imports: [EmptyStateComponent, NgTemplateOutlet, TranslatePipe],
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T extends object> {
  readonly columns = input.required<readonly TableColumn[]>()
  readonly rows = input.required<readonly T[]>()
  readonly caption = input('table.caption')
  readonly captionVisible = input(false)
  readonly emptyKey = input('table.empty')

  protected readonly cell = contentChild<TemplateRef<TableCellContext<T>>>('cell')

  protected context(row: T, column: TableColumn): TableCellContext<T> {
    return { $implicit: row, row, column }
  }

  protected text(row: T, column: TableColumn): string {
    const value = (row as Record<string, unknown>)[column.key]
    const plain =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    return plain ? String(value) : ''
  }
}
