import { env } from '../config/env'

// The one logger. One line per call on stdout or stderr: the message, then the fields as
// key=value. `quiet` drops info lines (under bun test) so suites stay readable; warn and
// error always print, and the error object is handed to the sink so its stack prints.
// Headers, bodies and secrets never go into a field, and as a backstop a field whose key
// looks sensitive prints [redacted] (the key stays visible). The console message provider's
// development print of a one-time code bypasses this logger on purpose: it is the one place
// a code is meant to be seen. This module is the seam where a logging library would go if a
// product ever needed one; nothing else calls console.
export type Fields = Record<string, string | number | boolean | null | undefined>

export type Logger = {
  info(message: string, fields?: Fields): void
  warn(message: string, fields?: Fields): void
  error(message: string, fields?: Fields, error?: unknown): void
}

type Sink = Pick<Console, 'info' | 'warn' | 'error'>

export function createLogger({ quiet, sink = console }: { quiet: boolean; sink?: Sink }): Logger {
  return {
    info(message, fields) {
      if (!quiet) sink.info(line(message, fields))
    },
    warn(message, fields) {
      sink.warn(line(message, fields))
    },
    error(message, fields, error) {
      if (error === undefined) sink.error(line(message, fields))
      else sink.error(line(message, fields), error)
    },
  }
}

const SENSITIVE_KEY = /password|token|secret|otp|code|cookie|authorization/i

function line(message: string, fields?: Fields): string {
  if (fields === undefined) return message
  const parts: string[] = []
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      parts.push(`${key}=${SENSITIVE_KEY.test(key) ? '[redacted]' : formatValue(value)}`)
    }
  }
  return parts.length === 0 ? message : `${message} ${parts.join(' ')}`
}

function formatValue(value: string | number | boolean | null): string {
  const text = String(value)
  return /\s/.test(text) ? JSON.stringify(text) : text
}

export const log = createLogger({ quiet: env.NODE_ENV === 'test' })
