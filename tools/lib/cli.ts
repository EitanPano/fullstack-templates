import path from 'node:path'

// import.meta.dir is tools/lib, so the catalog repository root is two levels up.
export const CATALOG_ROOT = path.resolve(import.meta.dir, '..', '..')

export class CliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliError'
  }
}

export interface ArgSpec {
  values?: readonly string[]
  repeatable?: readonly string[]
  booleans?: readonly string[]
}

export interface ParsedArgs {
  values: Record<string, string>
  lists: Record<string, string[]>
  booleans: Record<string, boolean>
}

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const values: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  const booleans: Record<string, boolean> = {}
  for (const name of spec.repeatable ?? []) lists[name] = []
  for (const name of spec.booleans ?? []) booleans[name] = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (!arg.startsWith('--')) throw new CliError(`unexpected argument "${arg}"`)
    const name = arg.slice(2)
    if (spec.booleans?.includes(name)) {
      booleans[name] = true
    } else if (spec.values?.includes(name) || spec.repeatable?.includes(name)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`--${name} needs a value`)
      }
      if (spec.repeatable?.includes(name)) (lists[name] as string[]).push(value)
      else values[name] = value
    } else {
      throw new CliError(`unknown argument "${arg}"`)
    }
  }
  return { values, lists, booleans }
}

export function fail(message: string, code: 1 | 2): never {
  process.stderr.write(`generate: ${message}\n`)
  process.exit(code)
}
