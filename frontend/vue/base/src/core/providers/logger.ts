import { env } from '@/core/config/env'

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

type Level = 'debug' | 'info' | 'warn' | 'error'

// Console logging with redaction. Production keeps `error` only.
export function createLogger(quiet: boolean) {
  const write = (level: Level, message: string, details: unknown[]) => {
    if (quiet && level !== 'error') return
    console[level](redact(message), ...details.map((detail) => redact(detail)))
  }
  return {
    debug: (message: string, ...details: unknown[]) => {
      write('debug', message, details)
    },
    info: (message: string, ...details: unknown[]) => {
      write('info', message, details)
    },
    warn: (message: string, ...details: unknown[]) => {
      write('warn', message, details)
    },
    error: (message: string, ...details: unknown[]) => {
      write('error', message, details)
    },
  }
}

export const logger = createLogger(env.MODE === 'production')
