import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { CatalogError, loadCatalog } from './lib/catalog'
import { CATALOG_ROOT, CliError, parseArgs } from './lib/cli'
import { dryRunMarkers } from './lib/dry-run'
import { checkLockfiles } from './lib/lockfiles'
import { PinError, checkPins, pinCapability } from './lib/pins'
import { MATRIX_END, MATRIX_START, ReadmeError, renderMatrix, replaceMatrix } from './lib/readme'

const normalise = (text: string) => text.replaceAll('\r\n', '\n').trim()

function checkReadme(root: string, matrix: string, write: boolean): string[] {
  const file = path.join(root, 'README.md')
  if (!existsSync(file)) return ['README.md: missing']
  const readme = readFileSync(file, 'utf8')
  try {
    const updated = replaceMatrix(readme, matrix)
    if (write) {
      writeFileSync(file, updated)
      return []
    }
    const start = readme.indexOf(MATRIX_START) + MATRIX_START.length
    const current = readme.slice(start, readme.indexOf(MATRIX_END))
    return normalise(current) === normalise(matrix)
      ? []
      : ['README.md: matrix is stale, run validate --readme']
  } catch (error) {
    if (error instanceof ReadmeError) return [`README.md: ${error.message}`]
    throw error
  }
}

function run(argv: string[]): string[] {
  const args = parseArgs(argv, { values: ['catalog', 'pin'], booleans: ['readme', 'lockfiles'] })
  const root = args.values.catalog ? path.resolve(args.values.catalog) : CATALOG_ROOT
  const catalog = loadCatalog(root)
  if (args.values.pin !== undefined) {
    pinCapability(catalog, args.values.pin, (line) => console.log(line))
    return []
  }
  const problems = [...catalog.templates.values()].flatMap((template) => dryRunMarkers(template))
  problems.push(...checkPins(catalog))
  problems.push(...checkReadme(root, renderMatrix(catalog), args.booleans.readme === true))
  if (args.booleans.lockfiles === true) problems.push(...checkLockfiles(catalog))
  return problems
}

function main(): void {
  let problems: string[]
  try {
    problems = run(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CatalogError) problems = error.problems
    else if (error instanceof CliError) {
      process.stdout.write(`validate: ${error.message}\n`)
      process.exit(2)
    } else if (error instanceof PinError) {
      process.stdout.write(`validate: ${error.message}\n`)
      process.exit(2)
    } else throw error
  }
  if (problems.length === 0) {
    // --pin only rewrites the pins; it does not validate the catalog.
    if (!process.argv.includes('--pin')) console.log('validate: ok')
    return
  }
  for (const problem of problems) console.log(`validate: ${problem}`)
  process.exit(1)
}

main()
