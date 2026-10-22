import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CatalogError, loadCatalog, type Catalog } from './lib/catalog'
import { listCases, requestFor, type GenerationCase } from './lib/cases'
import { CATALOG_ROOT, CliError, fail, parseArgs } from './lib/cli'
import { runCommand } from './lib/commands'
import { removeTree } from './lib/files'
import { generate } from './lib/generate'
import { resolveRequest } from './lib/plan'

const USAGE =
  'usage: bun tools/test-generated.ts [--catalog <root>] [--list] [--case <id>]... [--e2e] [--keep]'

interface Options {
  e2e: boolean
  keep: boolean
}

// Any throw for one case, expected or not, is that case's FAIL and never aborts the run.
function runCase(catalog: Catalog, c: GenerationCase, out: string, options: Options): void {
  const plan = resolveRequest(catalog, requestFor(c, out))
  generate(catalog, plan, { log: () => undefined })
  for (const pkg of plan.packages) {
    const { commands } = pkg.template.manifest
    const cwd = path.join(out, pkg.dir)
    runCommand(commands.check, cwd)
    if (options.e2e && commands.testE2e) runCommand(commands.testE2e, cwd)
  }
}

function run(argv: string[]): number {
  const args = parseArgs(argv, {
    values: ['catalog'],
    repeatable: ['case'],
    booleans: ['list', 'e2e', 'keep'],
  })
  const catalog = loadCatalog(
    args.values.catalog ? path.resolve(args.values.catalog) : CATALOG_ROOT,
  )
  const cases = listCases(catalog)
  if (args.booleans.list) {
    console.log(JSON.stringify(cases.map((c) => c.id)))
    return 0
  }

  const wanted = args.lists.case as string[]
  for (const id of wanted) {
    if (!cases.some((c) => c.id === id)) throw new CliError(`unknown case: ${id}`)
  }
  const selected = wanted.length > 0 ? cases.filter((c) => wanted.includes(c.id)) : cases
  const options = { e2e: args.booleans.e2e as boolean, keep: args.booleans.keep as boolean }

  let failed = 0
  for (const c of selected) {
    const out = mkdtempSync(path.join(os.tmpdir(), 'fullstack-case-'))
    let ok = true
    try {
      runCase(catalog, c, out, options)
    } catch (error) {
      ok = false
      console.log(error instanceof Error ? error.message : String(error))
    }
    if (ok) {
      console.log(`PASS ${c.id}`)
    } else {
      failed++
      console.log(`FAIL ${c.id} (${out})`)
    }
    if (ok && !options.keep) removeTree(out)
    else if (ok) console.log(`KEPT ${out}`)
  }
  console.log(`${selected.length - failed} of ${selected.length} cases passed`)
  return failed > 0 ? 1 : 0
}

function main(): void {
  try {
    process.exit(run(process.argv.slice(2)))
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${USAGE}\n`)
      fail(error.message, 2, 'test-generated')
    }
    if (error instanceof CatalogError) fail(error.message, 1, 'test-generated')
    fail(error instanceof Error ? error.message : String(error), 1, 'test-generated')
  }
}

main()
