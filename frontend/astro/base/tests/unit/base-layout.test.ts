// The one layout every page shares: the skip link first, the page's one main, the theme script as a
// file. The layout is the template's own glue, so it is rendered once through Astro's container.
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import BaseLayout from '../../src/layouts/base-layout.astro'

let html = ''
beforeAll(async () => {
  const container = await AstroContainer.create()
  html = await container.renderToString(BaseLayout, {
    props: { title: 'About us', description: 'What we do.' },
    slots: { default: '<h1>Inside</h1>' },
  })
})

describe('base layout', () => {
  it('puts the skip link before main and points it at main', () => {
    const skip = html.indexOf('class="skip-link"')
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(html.indexOf('<main'))
    expect(html).toContain('href="#main"')
  })

  it('has exactly one main with the id the skip link targets, holding the slot', () => {
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toMatch(/<main[^>]*id="main"/)
    expect(html).toMatch(/<main[^>]*>[\s\S]*<h1>Inside<\/h1>[\s\S]*<\/main>/)
  })

  it('sets the title and the description', () => {
    expect(html).toContain('<title>About us</title>')
    expect(html).toContain('<meta name="description" content="What we do."')
  })

  it('loads the theme script as a file, the only script it writes', () => {
    expect(html.match(/<script\b/g)).toHaveLength(1)
    expect(html).toMatch(/<script[^>]*src="\/theme-init\.js"/)
  })

  it('declares the language and the density on the root element', () => {
    expect(html).toMatch(/<html[^>]*lang="en"/)
    expect(html).toMatch(/<html[^>]*data-density="(comfortable|compact)"/)
  })

  it('writes no header, navigation or footer: those are product code', () => {
    expect(html).not.toMatch(/<(header|nav|footer)\b/)
  })
})
