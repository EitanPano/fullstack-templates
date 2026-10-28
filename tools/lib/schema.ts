import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ValidateFunction } from 'ajv'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

export type SchemaName =
  'index' | 'template' | 'stack' | 'cases' | 'provenance' | 'provider' | 'capability'

export const SCHEMAS_DIR = path.resolve(import.meta.dir, '..', '..', 'schemas')

const NAMES: readonly SchemaName[] = [
  'index',
  'template',
  'stack',
  'cases',
  'provenance',
  'provider',
  'capability',
]

let validators: Map<SchemaName, ValidateFunction> | undefined

function build(): Map<SchemaName, ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const built = new Map<SchemaName, ValidateFunction>()
  for (const name of NAMES) {
    const schema: unknown = JSON.parse(
      readFileSync(path.join(SCHEMAS_DIR, `${name}.schema.json`), 'utf8'),
    )
    built.set(name, ajv.compile(schema as object))
  }
  return built
}

// JSON Schema cannot express uniqueness by one property of an array item.
function duplicateCaseNames(data: unknown): string[] {
  if (typeof data !== 'object' || data === null || !('cases' in data)) return []
  const { cases } = data as { cases: unknown }
  if (!Array.isArray(cases)) return []
  const seen = new Set<unknown>()
  const errors: string[] = []
  cases.forEach((item: unknown, i) => {
    const name =
      typeof item === 'object' && item !== null ? (item as { name?: unknown }).name : undefined
    if (name === undefined) return
    if (seen.has(name)) errors.push(`/cases/${i}/name must be unique`)
    seen.add(name)
  })
  return errors
}

export function validateAgainst(schema: SchemaName, data: unknown): string[] {
  validators ??= build()
  const validate = validators.get(schema)
  if (!validate) throw new Error(`Unknown schema: ${schema}`)
  validate(data)
  const errors = (validate.errors ?? []).map(
    (e) =>
      `${e.instancePath || '/'} ${e.message ?? 'is invalid'}` +
      (e.keyword === 'additionalProperties' ? ` (${String(e.params.additionalProperty)})` : ''),
  )
  if (schema === 'cases') errors.push(...duplicateCaseNames(data))
  return errors
}
