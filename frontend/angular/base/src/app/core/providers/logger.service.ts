import { Injectable } from '@angular/core'

import { environment } from '../../../environments/environment'

const SENSITIVE_KEY = /token|password|secret|authorization|cookie/i
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g
const REDACTED = '[redacted]'
const MAX_DEPTH = 4

// Replaces the value of a sensitive key and any email-like text, at any depth (bounded).
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.replace(EMAIL, REDACTED)
  if (value instanceof Error) return { name: value.name, message: redact(value.message) }
  if (typeof value !== 'object' || value === null) return value
  if (depth >= MAX_DEPTH) return REDACTED
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1),
    ]),
  )
}

// Console logging with redaction. Production keeps `error` only.
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly quiet = environment.production

  debug(message: string, ...details: unknown[]): void {
    this.write('debug', message, details)
  }

  info(message: string, ...details: unknown[]): void {
    this.write('info', message, details)
  }

  warn(message: string, ...details: unknown[]): void {
    this.write('warn', message, details)
  }

  error(message: string, ...details: unknown[]): void {
    this.write('error', message, details)
  }

  private write(level: 'debug' | 'info' | 'warn' | 'error', message: string, details: unknown[]) {
    if (this.quiet && level !== 'error') return
    console[level](redact(message), ...details.map((detail) => redact(detail)))
  }
}
