// error-copy.ts belongs: the lookup from an envelope code to the message a visitor reads. The
// server's own text never reaches the page; an unknown code reads as the unknown message.
// It does not belong: the table (models/error/constant.ts).
import { ERROR_COPY } from '../models/error/constant'

export function errorMessage(code: string): string {
  return Object.hasOwn(ERROR_COPY, code)
    ? ERROR_COPY[code as keyof typeof ERROR_COPY]
    : ERROR_COPY.unknown
}
