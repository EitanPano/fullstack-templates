// body.ts belongs: reading a request body as JSON, capped at MAX_BODY_BYTES, on the web platform
// stream (no Buffer). It does not belong: validating the result (validate.ts) or limiting.
import { MAX_BODY_BYTES } from '../config/constants'
import { AppError } from '../services/utils/error'

// A body not declared as JSON is ignored (so validation sees none); an empty one is none too.
// The caller may name a smaller cap, as the SDK namespace does. // @sdk
export async function readJsonBody(request: Request): Promise<unknown> { // @nosdk
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> { // @sdk
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(request.headers.get('content-type') ?? '')) {
    return undefined
  }
  const text = await readText(request) // @nosdk
  const text = await readText(request, maxBytes) // @sdk
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('validation_failed', 'malformed JSON body')
  }
}

async function readText(request: Request): Promise<string> { // @nosdk
async function readText(request: Request, maxBytes: number): Promise<string> { // @sdk
  const tooLarge = () => new AppError('payload_too_large', 'request body is too large')
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw tooLarge() // @nosdk
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge() // @sdk
  const reader = request.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) { // @nosdk
    if (size > maxBytes) { // @sdk
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
