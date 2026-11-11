import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, filter, map, throwError } from 'rxjs'

import { ApiError } from '@app/services/api-error'

export interface UploadLimits {
  // The largest file in bytes, checked before any request.
  readonly maxBytes: number
  // Like an input `accept`: `.png`, `image/*` or `application/pdf`. Empty or absent: any type.
  readonly accept?: readonly string[]
}

export type UploadEvent<T = unknown> =
  { kind: 'progress'; percent: number } | { kind: 'done'; body: T }

function accepted(file: File, accept: readonly string[] = []): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (accept.length === 0) return true
  return accept.some((rule) => {
    const pattern = rule.trim().toLowerCase()
    if (pattern.startsWith('.')) return name.endsWith(pattern)
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1))
    return type === pattern
  })
}

function refusal(reason: 'payload_too_large' | 'unsupported_media_type'): Observable<never> {
  return throwError(
    () => new ApiError({ status: 0, code: 'validation', fieldErrors: { file: [reason] } }),
  )
}

// Uploads one file as multipart form data, with progress. It uses HttpClient directly (the
// generated SDK reports no progress), so the interceptors still see the request. The endpoint is
// the caller's: the template has no upload route. A file over the limit or of a refused type
// fails before any request with `code: 'validation'` and the reason under `fieldErrors.file`.
// Unsubscribe to cancel.
@Injectable({ providedIn: 'root' })
export class FileUploadService {
  private readonly http = inject(HttpClient)

  upload<T = unknown>(url: string, file: File, limits: UploadLimits): Observable<UploadEvent<T>> {
    if (file.size > limits.maxBytes) return refusal('payload_too_large')
    if (!accepted(file, limits.accept)) return refusal('unsupported_media_type')

    const body = new FormData()
    body.append('file', file)
    return this.http
      .request<T>(new HttpRequest('POST', url, body, { reportUploadProgress: true }))
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.UploadProgress || event.type === HttpEventType.Response,
        ),
        map((event): UploadEvent<T> => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0
            return { kind: 'progress', percent }
          }
          return { kind: 'done', body: (event as { body: T }).body }
        }),
      )
  }
}
