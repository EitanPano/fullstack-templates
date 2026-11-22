// jsonc.ts belongs: reading a wrangler.jsonc in a test, and the check that no secret was written
// into one. It does not belong: assertions about one file (the tests that read it).
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type Database = {
  binding: string
  database_name: string
  database_id: string
  migrations_dir?: string
}
export type Environment = { vars?: Record<string, unknown>; d1_databases?: Database[] }
export type Config = Environment & {
  name: string
  main?: string
  compatibility_date: string
  compatibility_flags: string[]
  assets?: {
    directory?: string
    binding?: string
    not_found_handling?: string
    run_worker_first?: boolean | string[]
  }
  triggers?: { crons?: string[] }
  env: { preview: Environment; production: Environment }
}

// Strips // and /* */ comments outside strings, then parses; no JSONC dependency.
export function parseJsonc(text: string): Config {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? ''
    const next = text[i + 1]
    if (inString) {
      out += char
      if (char === '\\') out += text[++i] ?? ''
      else if (char === '"') inString = false
    } else if (char === '"') {
      inString = true
      out += char
    } else if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (char === '/' && next === '*') {
      i = text.indexOf('*/', i + 2) + 1
    } else {
      out += char
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as Config
}

export function readConfig(relative: string): Config {
  return parseJsonc(readFileSync(path.join(import.meta.dirname, '../..', relative), 'utf8'))
}

const LOOKS_SECRET = /secret|token|password|passwd|api[-_]?key|private|credential|encryption/i

export function leakedSecrets(node: unknown, trail: string): string[] {
  if (typeof node !== 'object' || node === null) return []
  return Object.entries(node).flatMap(([key, value]) => {
    const here = trail + '.' + key
    const own = LOOKS_SECRET.test(key) && typeof value === 'string' && value !== '' ? [here] : []
    return [...own, ...leakedSecrets(value, here)]
  })
}
