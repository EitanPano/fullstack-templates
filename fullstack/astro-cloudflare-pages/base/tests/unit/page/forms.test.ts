// @vitest-environment jsdom
// services/forms.ts: what a page's form script uses to show an envelope's field errors and to say
// its handler is attached. The markup is the kit's field and input (components/ui).
import { beforeEach, describe, expect, it } from 'vitest'

import { FIELD_ERROR_COPY } from '../../../src/models/error/constant'
import { ApiError } from '../../../src/services/api'
import {
  applyFieldErrors,
  clearFieldErrors,
  markReady,
  showFieldError,
} from '../../../src/services/forms'

function form(): HTMLFormElement {
  document.body.innerHTML = `
    <form method="post" action="/never">
      <div data-field><input name="name" id="f-name" aria-describedby="f-name-error"><div data-field-error id="f-name-error"></div></div>
      <div data-field><input name="note" id="f-note"><div data-field-error id="f-note-error"></div></div>
    </form>`
  return document.querySelector('form') as HTMLFormElement
}

let target: HTMLFormElement
beforeEach(() => {
  target = form()
})

describe('showFieldError and clearFieldErrors', () => {
  it('writes the message in the field region and marks the control invalid', () => {
    expect(showFieldError(target, 'name', 'Bad.')).toBe(true)

    expect(document.getElementById('f-name-error')?.textContent).toBe('Bad.')
    expect(document.getElementById('f-name')?.getAttribute('aria-invalid')).toBe('true')
  })

  it('reports a name that is no field of the form', () => {
    expect(showFieldError(target, 'missing', 'Bad.')).toBe(false)
  })

  it('clears every region and every invalid mark', () => {
    showFieldError(target, 'name', 'Bad.')
    showFieldError(target, 'note', 'Bad.')

    clearFieldErrors(target)

    expect(document.getElementById('f-name-error')?.textContent).toBe('')
    expect(document.querySelectorAll('[aria-invalid]')).toHaveLength(0)
  })
})

describe('applyFieldErrors', () => {
  it('shows the copy, never server text, on each field the envelope names', () => {
    const error = new ApiError('validation_failed', { fieldPaths: ['name'] })

    const unmapped = applyFieldErrors(target, error)

    expect(unmapped).toEqual([])
    expect(document.getElementById('f-name-error')?.textContent).toBe(FIELD_ERROR_COPY)
    expect(document.getElementById('f-note-error')?.textContent).toBe('')
  })

  it('returns the paths that name no field so the page can toast once', () => {
    const error = new ApiError('validation_failed', { fieldPaths: ['name', 'body.other'] })

    expect(applyFieldErrors(target, error)).toEqual(['body.other'])
  })

  it('replaces the errors of the last attempt', () => {
    showFieldError(target, 'note', 'Old.')

    applyFieldErrors(target, new ApiError('validation_failed', { fieldPaths: ['name'] }))

    expect(document.getElementById('f-note-error')?.textContent).toBe('')
  })
})

describe('markReady', () => {
  it('sets data-ready so a test never submits before the handler is attached', () => {
    expect(target.hasAttribute('data-ready')).toBe(false)

    markReady(target)

    expect(target.getAttribute('data-ready')).toBe('true')
  })
})
