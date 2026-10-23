import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CatalogError, loadCatalog } from './lib/catalog'
import { listCases } from './lib/cases'
import { CATALOG_ROOT, CliError, fail, parseArgs } from './lib/cli'
import { removeTree } from './lib/files'
import { runCase } from './lib/run-case'

const USAGE =
  'usage: bun tools/test-generated.ts [--catalog <root>] [--list] [--case <id>]... [--e2e [--install-browsers]] [--keep] [--with-services]'

function run(argv: string[]): number {
  const args = parseArgs(argv, {
    values: ['catalog'],
    repeatable: ['case'],
    booleans: ['list', 'e2e', 'keep', 'install-browsers', 'with-services'],
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
  const options = {
    e2e: args.booleans.e2e as boolean,
    installBrowsers: args.booleans['install-browsers'] as boolean,
    keep: args.booleans.keep as boolean,
    withServices: args.booleans['with-services'] as boolean,
  }

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
