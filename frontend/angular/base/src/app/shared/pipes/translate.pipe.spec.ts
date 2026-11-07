import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { Translator } from '../i18n/translator'
import { TranslatePipe } from './translate.pipe'

class FakeTranslator extends Translator {
  readonly lang = signal('en')

  translate(key: string, params?: Record<string, string | number>): string {
    return `${this.lang()}:${key}:${JSON.stringify(params ?? {})}`
  }
}

describe('TranslatePipe', () => {
  it('asks the translator for the key and params', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Translator, useClass: FakeTranslator }],
    })
    const pipe = TestBed.runInInjectionContext(() => new TranslatePipe())
    expect(pipe.transform('a.b')).toBe('en:a.b:{}')
    expect(pipe.transform('a.b', { n: 2 })).toBe('en:a.b:{"n":2}')
  })

  it('re-reads after the language changes (it is impure)', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: Translator, useClass: FakeTranslator }],
    })
    const translator = TestBed.inject(Translator) as FakeTranslator
    const pipe = TestBed.runInInjectionContext(() => new TranslatePipe())
    expect(pipe.transform('k')).toBe('en:k:{}')
    translator.lang.set('he')
    expect(pipe.transform('k')).toBe('he:k:{}')
  })
})
