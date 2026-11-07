import { HttpEventType, provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import { isApiError } from '@app/models/api/response'

import { FileUploadService, type UploadEvent } from './file-upload.service'

const LIMITS = { maxBytes: 10, accept: ['image/*', '.pdf'] }

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('FileUploadService', () => {
  let service: FileUploadService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    service = TestBed.inject(FileUploadService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    http.verify()
  })

  it('reports progress, then the response body', () => {
    const events: UploadEvent[] = []
    service.upload('/api/file', file('a.png', 'image/png', 4), LIMITS).subscribe((e) => {
      events.push(e)
    })
    const request = http.expectOne('/api/file')
    expect(request.request.reportUploadProgress).toBe(true)
    expect(request.request.body).toBeInstanceOf(FormData)
    request.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 4 })
    request.event({ type: HttpEventType.UploadProgress, loaded: 4, total: 4 })
    request.flush({ id: 'f1' })
    expect(events).toEqual([
      { kind: 'progress', percent: 25 },
      { kind: 'progress', percent: 100 },
      { kind: 'done', body: { id: 'f1' } },
    ])
  })

  it('accepts a file by extension as well as by type', () => {
    service.upload('/api/file', file('a.PDF', 'application/pdf', 4), LIMITS).subscribe()
    http.expectOne('/api/file').flush({})
  })

  it('accepts any type when the accept list is empty or absent', () => {
    service
      .upload('/api/file', file('a.exe', 'application/x-msdownload', 3), {
        maxBytes: 10,
        accept: [],
      })
      .subscribe()
    http.expectOne('/api/file').flush({})
    service
      .upload('/api/file', file('b.exe', 'application/x-msdownload', 3), { maxBytes: 10 })
      .subscribe()
    http.expectOne('/api/file').flush({})
  })

  it('refuses a file over the size limit before any request', () => {
    let error: unknown
    service.upload('/api/file', file('a.png', 'image/png', 11), LIMITS).subscribe({
      error: (e: unknown) => {
        error = e
      },
    })
    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'validation',
      fieldErrors: { file: ['payload_too_large'] },
    })
    http.expectNone('/api/file')
  })

  it('refuses a file of another type before any request', () => {
    let error: unknown
    service.upload('/api/file', file('a.exe', 'application/x-msdownload', 3), LIMITS).subscribe({
      error: (e: unknown) => {
        error = e
      },
    })
    expect(error).toMatchObject({
      code: 'validation',
      fieldErrors: { file: ['unsupported_media_type'] },
    })
    http.expectNone('/api/file')
  })

  it('cancels the request on unsubscribe', () => {
    const subscription = service
      .upload('/api/file', file('a.png', 'image/png', 4), LIMITS)
      .subscribe()
    const request = http.expectOne('/api/file')
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
  })
})
