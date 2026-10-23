import { CommandError, commandOutput } from './commands'
import type { GenerationPlan } from './plan'

// Returns what `<name> --version` printed, or undefined when the program cannot be run.
export type VersionRunner = (name: string) => string | undefined

export const runVersion: VersionRunner = (name) => {
  try {
    return commandOutput(`${name} --version`, process.cwd())
  } catch (error) {
    if (error instanceof CommandError) return undefined
    throw error
  }
}

type Version = [number, number, number]
// The first MAJOR[.MINOR[.PATCH]] in the text, so `uv 0.12.23 (abc 2026-10-01)` reads as 0.12.23
// and a template may declare a minimum of just `24`.
export function parseVersion(text: string): Version | undefined {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text)
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compare(a: Version, b: Version): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

// Checks each distinct tool the planned templates declare, running its --version once. Returns the
// first problem, or undefined when every tool is present and new enough.
export function findToolProblem(
  plan: GenerationPlan,
  run: VersionRunner = runVersion,
): string | undefined {
  const minimums = new Map<string, Array<{ min?: string; max?: string; template: string }>>()
  for (const { template } of plan.packages) {
    for (const tool of template.manifest.tools) {
      const list = minimums.get(tool.name) ?? []
      if (tool.min !== undefined || tool.max !== undefined) {
        list.push({ min: tool.min, max: tool.max, template: template.path })
      }
      minimums.set(tool.name, list)
    }
  }
  for (const [name, requirements] of minimums) {
    const output = run(name)
    if (output === undefined) {
      const needed = requirements.flatMap((r) => (r.min === undefined ? [] : [r.min])).join(', ')
      return `tool ${name}: not found${needed === '' ? '' : `; minimum is ${needed}`}`
    }
    const found = parseVersion(output)
    for (const { min, max, template } of requirements) {
      const wanted = min === undefined ? undefined : parseVersion(min)
      const ceiling = max === undefined ? undefined : parseVersion(max)
      if (min !== undefined && wanted === undefined) {
        return `tool ${name}: ${template} declares an unreadable minimum "${min}"`
      }
      if (max !== undefined && ceiling === undefined) {
        return `tool ${name}: ${template} declares an unreadable maximum "${max}"`
      }
      if (found === undefined) {
        return `tool ${name}: found no version in "${output.trim()}"${min === undefined ? '' : `; minimum is ${min}`}`
      }
      if (wanted !== undefined && compare(found, wanted) < 0) {
        return `tool ${name}: found ${found.join('.')}, minimum is ${min}`
      }
      if (ceiling !== undefined && compare(found, ceiling) >= 0) {
        return `tool ${name}: found ${found.join('.')}, must be below ${max}`
      }
    }
  }
  return undefined
}
