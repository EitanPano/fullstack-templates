import { HttpClient, HttpContext } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type { Translation, TranslocoLoader } from '@jsverse/transloco'
import type { Observable } from 'rxjs'

import { BACKGROUND } from '../config/http-context'

// Fetches a copy table at runtime (angular.json serves translations/ at /i18n), so the bundle
// carries no language but the one asked for. BACKGROUND keeps it out of the loading counter: a
// language switch is not a page load.
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient)

  getTranslation(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`/i18n/${lang}.json`, {
      context: new HttpContext().set(BACKGROUND, true),
    })
  }
}
