// Every kit component (src/components/ui) rendered once through Astro's container: each one builds
// and its markup is asserted. The kit has no page that shows it, so this is where it is exercised.
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { beforeAll, describe, expect, it } from 'vitest'

import Alert from '../../../src/components/ui/alert/alert.astro'
import Button from '../../../src/components/ui/button/button.astro'
import Card from '../../../src/components/ui/card/card.astro'
import Field from '../../../src/components/ui/field/field.astro'
import Input from '../../../src/components/ui/input/input.astro'
import Skeleton from '../../../src/components/ui/skeleton/skeleton.astro'
import Spinner from '../../../src/components/ui/spinner/spinner.astro'
import ThemeToggle from '../../../src/components/ui/theme-toggle/theme-toggle.astro'
import Toast from '../../../src/components/ui/toast/toast.astro'

let container: AstroContainer
beforeAll(async () => {
  container = await AstroContainer.create()
})

const render = (component: Parameters<AstroContainer['renderToString']>[0], options = {}) =>
  container.renderToString(component, options)

describe('button', () => {
  it('is a button of type button, primary and medium by default', async () => {
    const html = await render(Button, { slots: { default: 'Save' } })
    expect(html).toMatch(/<button[^>]*type="button"/)
    expect(html).toContain('button button--primary')
    expect(html).not.toContain('button--md')
    expect(html).toContain('Save')
  })

  it('is a link with the same look when it has an href', async () => {
    const html = await render(Button, {
      props: { href: '/x', variant: 'secondary' },
      slots: { default: 'Go' },
    })
    expect(html).toMatch(/<a[^>]*href="\/x"/)
    expect(html).toContain('button--secondary')
    expect(html).not.toContain('<button')
  })

  it('is disabled and busy while loading, with a silent spinner', async () => {
    const html = await render(Button, { props: { loading: true }, slots: { default: 'Save' } })
    expect(html).toContain('disabled')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('is-loading')
    expect(html).toContain('aria-hidden="true"')
  })

  it('refuses an icon button without an accessible name', async () => {
    await expect(render(Button, { props: { size: 'icon' } })).rejects.toThrow(/aria-label/)
    const html = await render(Button, { props: { size: 'icon', 'aria-label': 'Close' } })
    expect(html).toContain('button--icon')
    expect(html).toContain('aria-label="Close"')
  })
})

describe('field and input', () => {
  it('ties the label, the hint and the error region to the control by id', async () => {
    const html = await render(Field, {
      props: { id: 'f-name', label: 'Name', hint: 'Shown on your card' },
      slots: {
        default: await render(Input, { props: { id: 'f-name', name: 'name', hint: true } }),
      },
    })
    expect(html).toContain('<label class="field__label" for="f-name">Name</label>')
    expect(html).toContain('id="f-name-hint"')
    expect(html).toMatch(
      /id="f-name-error"[^>]*data-field-error|data-field-error[^>]*id="f-name-error"/,
    )
    expect(html).toContain('aria-describedby="f-name-hint f-name-error"')
    expect(html).toContain('data-field')
  })

  it('shows a passed error and marks the field invalid', async () => {
    const html = await render(Field, { props: { id: 'f', label: 'L', error: 'Wrong.' } })
    expect(html).toContain('field--invalid')
    expect(html).toContain('Wrong.')
  })

  it('renders an input that carries native constraints and marks itself invalid on request', async () => {
    const html = await render(Input, {
      props: { id: 'f', name: 'name', required: true, maxlength: 100, invalid: true },
    })
    expect(html).toMatch(/<input[^>]*class="input"/)
    expect(html).toContain('maxlength="100"')
    expect(html).toContain('required')
    expect(html).toContain('aria-invalid="true"')
  })
})

describe('card, alert, spinner, skeleton', () => {
  it('card wraps its slot in a surface and takes another tag', async () => {
    const html = await render(Card, { props: { as: 'section' }, slots: { default: 'Inside' } })
    expect(html).toMatch(/<section[^>]*class="card"/)
    expect(html).toContain('Inside')
  })

  it('alert announces an error assertively and the rest politely', async () => {
    expect(await render(Alert, { props: { tone: 'error' }, slots: { default: 'x' } })).toContain(
      'role="alert"',
    )
    const info = await render(Alert, { slots: { default: 'x' } })
    expect(info).toContain('role="status"')
    expect(info).toContain('alert--info')
  })

  it('spinner is a labelled status alone and silent when decorative', async () => {
    const alone = await render(Spinner)
    expect(alone).toContain('role="status"')
    expect(alone).toContain('Loading')
    const quiet = await render(Spinner, { props: { decorative: true } })
    expect(quiet).not.toContain('role="status"')
    expect(quiet).toContain('aria-hidden="true"')
  })

  it('skeleton is hidden from assistive technology and counts its lines', async () => {
    const text = await render(Skeleton, { props: { lines: 4 } })
    expect(text).toContain('aria-hidden="true"')
    expect(text.match(/skeleton__item/g)).toHaveLength(4)
    const block = await render(Skeleton, { props: { variant: 'block', size: 'lg' } })
    expect(block).toContain('skeleton__item--lg')
  })
})

describe('toast and theme-toggle', () => {
  it('toast is the labelled live region toasts appear in', async () => {
    const html = await render(Toast)
    expect(html).toContain('data-toast-region')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-label="Notifications"')
  })

  it('theme-toggle is one named icon button with a status line and the three icons', async () => {
    const html = await render(ThemeToggle)
    expect(html).toContain('data-theme-toggle')
    expect(html).toContain('data-theme-toggle-button')
    expect(html).toContain('data-theme-toggle-status')
    expect(html.match(/theme-toggle__icon--/g)).toHaveLength(3)
  })
})
