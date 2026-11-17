// logger.ts belongs: the one logger. One JSON line per call on the console: the level, the
// message, then the fields. Headers, bodies and secrets never go into a field, and as a backstop a
// field whose key looks sensitive prints [redacted] at any depth (the key stays visible). This
// module is the seam where a logging service would go; nothing else calls console.
// It does not belong: deciding what to log (the middleware and controllers do) or the level
// (config/env.ts LOG_LEVEL).
export type Level = 'debug' | 'info' | 'warn' | 'error'

export type Fields = Record<string, unknown>

export type Logger = {
  debug(message: string, fields?: Fields): void
  info(message: string, fields?: Fields): void
  warn(message: string, fields?: Fields, error?: unknown): void
  error(message: string, fields?: Fields, error?: unknown): void
}

type Sink = { log(text: string): void; warn(text: string): void; error(text: string): void }

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

// Keys that name a credential. `code` is not here: the error code is not a secret.
const SENSITIVE_KEY =
  /pass(word|wd)|secret|token|authorization|cookie|otp|api[-_]?key|credential|session|encryption/i

export function createLogger({
  level,
  sink = console,
  bindings = {},
}: {
  level: Level
  sink?: Sink
  // Fields on every line, such as the request id.
  bindings?: Fields
}): Logger {
  function write(at: Level, message: string, fields: Fields | undefined, error?: unknown): void {
    if (ORDER[at] < ORDER[level]) return
    const entry: Fields = { level: at, message, ...bindings, ...fields }
    if (error !== undefined) entry.error = describe(error)
    const text = JSON.stringify(redact(entry))
    if (at === 'error') sink.error(text)
    else if (at === 'warn') sink.warn(text)
    else sink.log(text)
  }
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields, error) => write('warn', message, fields, error),
    error: (message, fields, error) => write('error', message, fields, error),
  }
}

// Drizzle's query error (DrizzleQueryError) carries `query` and `params`, and its message is
// "Failed query: <sql>, params: <values>": the values of a request would reach the log. It is
// logged with its query text (placeholders, no values) and its cause's message, the database's
// own words, and the same substitution is made in the stack.
type QueryError = Error & { query: string; params: unknown[] }

function isQueryError(error: Error): error is QueryError {
  const { query, params } = error as Partial<QueryError>
  return typeof query === 'string' && Array.isArray(params)
}

function describe(error: unknown): Fields {
  if (error instanceof Error && isQueryError(error)) {
    const message = error.cause instanceof Error ? error.cause.message : 'query failed'
    return {
      name: error.name,
      message,
      query: error.query,
      stack: error.stack?.replace(error.message, message),
    }
  }
  if (error instanceof Error)
    return { name: error.name, message: error.message, stack: error.stack }
  return { message: String(error) }
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item, depth + 1),
    ]),
  )
}
