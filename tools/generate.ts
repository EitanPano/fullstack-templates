import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CatalogError, loadCatalog } from './lib/catalog'
import { CATALOG_ROOT, CliError, fail, parseArgs } from './lib/cli'
import { generate, GenerateError } from './lib/generate'
import { PlanError, resolveRequest, type Answers } from './lib/plan'

const USAGE =
  'usage: bun tools/generate.ts (--stack <id> | --template <kind/id> [--dir <name>]) --out <dir> --name <name> ' +
  '[--flag k=v] [--capability k=v] [--answers <json-file>] [--catalog <root>] ' +
  '[--catalog-version <tag>] [--skip-post-generate] [--keep-staging]'

function readAnswers(file: string): Answers {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path.resolve(file), 'utf8'))
  } catch (error) {
    throw new CliError(`cannot read --answers ${file}: ${(error as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError('--answers must hold a JSON object')
  }
  return parsed as Answers
}

function run(argv: string[]): void {
  const args = parseArgs(argv, {
    values: ['stack', 'template', 'dir', 'out', 'name', 'answers', 'catalog', 'catalog-version'],
    repeatable: ['flag', 'capability'],
    booleans: ['skip-post-generate', 'keep-staging'],
  })
  const {
    out,
    name,
    stack,
    template,
    dir,
    answers,
    catalog,
    'catalog-version': version,
  } = args.values
  if (!out) throw new CliError('--out is required')
  if (name === undefined) throw new CliError('--name is required')
  if (!stack && !template) throw new CliError('one of --stack or --template is required')

  const loaded = loadCatalog(catalog ? path.resolve(catalog) : CATALOG_ROOT)
  const plan = resolveRequest(loaded, {
    out: path.resolve(process.cwd(), out),
    name,
    stack,
    template,
    dir,
    flags: args.lists.flag as string[],
    capabilities: args.lists.capability as string[],
    answers: answers ? readAnswers(answers) : undefined,
    catalogVersion: version,
    skipPostGenerate: args.booleans['skip-post-generate'] as boolean,
  })
  generate(loaded, plan, {
    keepStaging: args.booleans['keep-staging'],
    log: (line) => console.log(line),
  })
  console.log('Done. Next:')
  for (const pkg of plan.packages) {
    console.log(`  cd ${pkg.dir} && ${pkg.template.manifest.commands.check}`)
  }
}

function main(): void {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    if (error instanceof CliError) {
      process.stderr.write(`${USAGE}\n`)
      fail(error.message, 2, 'generate')
    }
    if (
      error instanceof CatalogError ||
      error instanceof PlanError ||
      error instanceof GenerateError
    ) {
      fail(error.message, 1, 'generate')
    }
    fail(error instanceof Error ? error.message : String(error), 1, 'generate')
  }
}

main()
