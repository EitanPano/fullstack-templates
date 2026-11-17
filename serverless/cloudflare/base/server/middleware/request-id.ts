// request-id.ts belongs: giving every API request an id, honouring a well-formed incoming
// x-request-id, so a client's report and a log line can be matched.
// It does not belong: setting the header (handler.ts does, on every response).
const REQUEST_ID = /^[\w.-]{8,128}$/

export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get('x-request-id')
  return incoming !== null && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID()
}
