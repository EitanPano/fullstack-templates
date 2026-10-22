import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { validateAgainst, type SchemaName } from './schema'

// Reads and schema-checks one YAML file; a failure is recorded and yields undefined.
export function readChecked<T>(
  file: string,
  label: string,
  schema: SchemaName,
  problems: string[],
): T | undefined {
  if (!existsSync(file)) {
    problems.push(`${label}: missing`)
    return undefined
  }
  let data: unknown
  try {
    data = parse(readFileSync(file, 'utf8'))
  } catch (error) {
    problems.push(`${label}: invalid YAML (${error instanceof Error ? error.message : 'unknown'})`)
    return undefined
  }
  const errors = validateAgainst(schema, data)
  if (errors.length > 0) {
    for (const message of errors) problems.push(`${label}: ${message}`)
    return undefined
  }
  return data as T
}

export function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory())
}
