import { appendText, type FrameModule } from '../../../src/frame'

/**
 * The modal fixture's frame half: a panel with a heading and a form of one required text field,
 * a submit button and a close button. A valid submit is handled here (the frame's policy allows
 * no form action), reported as `submitted`, and closes the unit. The form has `novalidate`: an
 * empty one is stopped here, and the field and its own error line say so, the same in every
 * engine. It tracks one item when it starts.
 */
export const fixtureModalFrame: FrameModule = {
  name: 'fixture-modal',
  start(ctx) {
    const doc = ctx.mount.ownerDocument
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
      const element = doc.createElement(tag)
      if (text) appendText(element, text)
      return element
    }

    const panel = make('div')
    panel.setAttribute('data-fixture-modal-panel', '')
    const heading = make('h2', 'Fixture dialog')
    const form = make('form')
    const label = make('label', 'Your answer')
    label.setAttribute('for', 'fixture-modal-field')
    const field = make('input')
    field.id = 'fixture-modal-field'
    field.setAttribute('type', 'text')
    field.setAttribute('name', 'answer')
    field.setAttribute('autocomplete', 'off')
    field.required = true
    form.noValidate = true
    // Shown by an empty submit; it stays on screen until the visitor types.
    const error = make('p', 'Enter an answer to continue')
    error.id = 'fixture-modal-error'
    error.hidden = true
    const actions = make('div')
    const submit = make('button', 'Send')
    submit.setAttribute('type', 'submit')
    const close = make('button', 'Close')
    close.setAttribute('type', 'button')
    close.setAttribute('data-fixture-modal-close', '')

    field.addEventListener('input', () => {
      field.removeAttribute('aria-invalid')
      field.removeAttribute('aria-describedby')
      error.hidden = true
    })
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (field.value.trim() === '') {
        field.setAttribute('aria-invalid', 'true')
        field.setAttribute('aria-describedby', error.id)
        error.hidden = false
        field.focus()
        return
      }
      ctx.emit('submitted')
      ctx.close()
    })
    close.addEventListener('click', () => ctx.close())

    actions.append(submit, close)
    form.append(label, field, error, actions)
    panel.append(heading, form)
    ctx.mount.appendChild(panel)
    // The field is the first thing a visitor uses: the kernel focuses it, not the module's mount.
    field.setAttribute('autofocus', '')
    ctx.track({ name: 'opened' })
  },
}
