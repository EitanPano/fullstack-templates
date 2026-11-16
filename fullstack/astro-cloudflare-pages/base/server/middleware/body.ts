// body.ts belongs: reading a request body as JSON, capped at MAX_BODY_BYTES, on the web platform
// stream (no Buffer). It does not belong: validating the result (validate.ts) or limiting.
import { MAX_BODY_BYTES } from '../config/constants'
import { AppError } from '../services/utils/error'

// A body not declared as JSON is ignored (so validation sees none); an empty one is none too.
export async function readJsonBody(request: Request): Promise<unknown> {
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(request.headers.get('content-type') ?? '')) {
    return undefined
  }
  const text = await readText(request)
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('validation_failed', 'malformed JSON body')
  }
}

async function readText(request: Request): Promise<string> {
  const tooLarge = () => new AppError('payload_too_large', 'request body is too large')
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) throw tooLarge()
  const reader = request.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
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
