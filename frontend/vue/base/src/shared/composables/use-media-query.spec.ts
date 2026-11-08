import { render } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { stubMatchMedia } from '@/testing/match-media'

import { useMediaQuery } from './use-media-query'

const QUERY = '(min-width: 10px)'

const Probe = defineComponent({
  props: { query: { type: String, required: true } },
  setup(props) {
    const matches = useMediaQuery(props.query)
    return () => h('p', matches.value ? 'match' : 'no match')
  },
})

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts from the current answer', () => {
    stubMatchMedia({ [QUERY]: true })

    const view = render(Probe, { props: { query: QUERY } })

    expect(view.getByText('match')).toBeInTheDocument()
  })

  it('follows the query as the viewport changes', async () => {
    const media = stubMatchMedia({ [QUERY]: false })
    const view = render(Probe, { props: { query: QUERY } })

    media.flip(QUERY, true)

    expect(await view.findByText('match')).toBeInTheDocument()
  })

  it('stops listening when the component unmounts', () => {
    const media = stubMatchMedia()
    const view = render(Probe, { props: { query: QUERY } })
    expect(media.listenerCount(QUERY)).toBe(1)

    view.unmount()

    expect(media.listenerCount(QUERY)).toBe(0)
  })
})
