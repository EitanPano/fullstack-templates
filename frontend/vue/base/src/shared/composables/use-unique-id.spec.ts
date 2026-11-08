import { render } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import { useUniqueId } from './use-unique-id'

/* eslint-disable vue/one-component-per-file -- a probe and its parent */
const Probe = defineComponent({
  props: { prefix: { type: String, required: true } },
  setup(props) {
    const id = useUniqueId(props.prefix)
    return () => h('p', { 'data-testid': 'id' }, id)
  },
})

describe('useUniqueId', () => {
  it('prefixes the id so it reads in the DOM', () => {
    const view = render(Probe, { props: { prefix: 'field' } })

    expect(view.getByTestId('id').textContent).toMatch(/^field-/)
  })

  it('never gives two components of one app the same id', () => {
    const Pair = defineComponent({
      render: () => h('div', [h(Probe, { prefix: 'field' }), h(Probe, { prefix: 'field' })]),
    })
    const view = render(Pair)

    const [first, second] = view.getAllByTestId('id').map((node) => node.textContent)
    expect(first).not.toBe(second)
  })
})
