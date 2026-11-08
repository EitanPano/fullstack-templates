import { createApp, defineComponent, h, withDirectives } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import { autofocus } from './autofocus'

// Mounts into an element that is already in the document, as the app does: the focus a directive
// sets is real only on a connected element.
function mount(children: () => ReturnType<typeof h>[]) {
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp(defineComponent({ render: () => h('div', children()) }))
  app.mount(container)
  return {
    container,
    unmount: () => {
      app.unmount()
      container.remove()
    },
  }
}

describe('v-autofocus', () => {
  let current: { unmount: () => void } | null = null

  afterEach(() => {
    current?.unmount()
    current = null
  })

  it('focuses its element after the first render', () => {
    current = mount(() => [
      h('input', { class: 'plain' }),
      withDirectives(h('input', { class: 'auto' }), [[autofocus]]),
    ])

    expect(document.activeElement).toBe(document.querySelector('.auto'))
  })

  it('focuses the first control inside a wrapper', () => {
    current = mount(() => [
      withDirectives(h('div', { class: 'wrapper' }, [h('input', { class: 'inner' })]), [
        [autofocus],
      ]),
    ])

    expect(document.activeElement).toBe(document.querySelector('.inner'))
  })

  it('skips a disabled element', () => {
    current = mount(() => [
      withDirectives(h('input', { class: 'auto', disabled: true }), [[autofocus]]),
      h('input', { class: 'other' }),
    ])

    expect(document.activeElement).not.toBe(document.querySelector('.auto'))
    expect(document.activeElement).toBe(document.body)
  })
})
