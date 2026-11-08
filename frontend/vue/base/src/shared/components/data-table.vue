<script setup lang="ts" generic="T extends object">
import EmptyState from './empty-state.vue'

export type TableColumn = {
  readonly key: string
  readonly labelKey: string
  readonly align?: 'start' | 'center' | 'end'
}

// A read-only table: one header per column (scope=col), one row per item, a caption for screen
// readers (visible with `captionVisible`), and an empty state in place of the body when there are
// no rows. A cell shows `row[column.key]` unless the `cell` slot ({ row, column }) renders it. The
// table scrolls sideways inside its own container, so a wide table never widens the page. The
// `empty` slot holds the way to add the first row. `captionKey`, `emptyKey` and each `labelKey`
// are keys of the copy table.
withDefaults(
  defineProps<{
    columns: readonly TableColumn[]
    rows: readonly T[]
    captionKey?: string
    captionVisible?: boolean
    emptyKey?: string
  }>(),
  { captionKey: 'table.caption', captionVisible: false, emptyKey: 'table.empty' },
)
defineSlots<{
  cell?: (props: { row: T; column: TableColumn }) => unknown
  empty?: () => unknown
}>()

function text(row: T, column: TableColumn): string {
  const value = (row as Record<string, unknown>)[column.key]
  const plain = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  return plain ? String(value) : ''
}
</script>

<template>
  <EmptyState v-if="rows.length === 0" :heading="$t(emptyKey)">
    <template #actions><slot name="empty" /></template>
  </EmptyState>
  <div v-else class="data-table" role="region" tabindex="0" :aria-label="$t(captionKey)">
    <table class="data-table__table">
      <caption :class="{ 'visually-hidden': !captionVisible }">
        {{
          $t(captionKey)
        }}
      </caption>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" scope="col" :data-align="column.align">
            {{ $t(column.labelKey) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td v-for="column in columns" :key="column.key" :data-align="column.align">
            <slot name="cell" :row="row" :column="column">{{ text(row, column) }}</slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
