import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TranslocoService, type Translation } from '@jsverse/transloco'

import { Translator } from '@app/shared/i18n/translator'

import { BACKGROUND } from '../config/http-context'
import { TranslocoHttpLoader } from './transloco-http.loader'
import { provideTranslator } from './translator.provider'

describe('TranslocoHttpLoader', () => {
  let loader: TranslocoHttpLoader
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslator()],
    })
    loader = TestBed.inject(TranslocoHttpLoader)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it('fetches /i18n/<lang>.json as a background request', () => {
    let table: Translation | undefined
    loader.getTranslation('he').subscribe((value) => {
      table = value
    })
    const request = http.expectOne('/i18n/he.json')
    expect(request.request.method).toBe('GET')
    expect(request.request.context.get(BACKGROUND)).toBe(true)
    request.flush({ app: { loading: 'טוען' } })
    expect(table).toEqual({ app: { loading: 'טוען' } })
  })

  it('errors when the table cannot be fetched', () => {
    let failed = false
    loader.getTranslation('xx').subscribe({
      error: () => {
        failed = true
      },
    })
    http.expectOne('/i18n/xx.json').flush('missing', { status: 404, statusText: 'Not Found' })
    expect(failed).toBe(true)
  })

  it('is what provideTranslator wires: the translator reads a table fetched from /i18n', () => {
    const translator = TestBed.runInInjectionContext(() => TestBed.inject(Translator))
    TestBed.inject(TranslocoService).load('en').subscribe()
    http.expectOne('/i18n/en.json').flush({ notFound: { title: 'Page not found' } })
    expect(translator.translate('notFound.title')).toBe('Page not found')
  })
})
