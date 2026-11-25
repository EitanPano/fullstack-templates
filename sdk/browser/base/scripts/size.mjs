// The size budget: a byte count per output, read from package.json (`sdk.sizeBudget`). It fails
// over a number, on a budgeted output that was not built, and on a package with no budget.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function checkSizes(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const budget = pkg.sdk?.sizeBudget ?? {}
  const files = Object.entries(budget)
  const failures = []
  const rows = []
  if (files.length === 0) failures.push('package.json has no sdk.sizeBudget')
  for (const [file, limit] of files) {
    const path = join(root, file)
    if (!existsSync(path)) {
      failures.push(`${file}: missing (budget ${limit} bytes)`)
      continue
    }
    const size = statSync(path).size
    rows.push(`${file}: ${size} / ${limit} bytes`)
    if (size > limit) failures.push(`${file}: ${size} bytes is over its budget of ${limit}`)
  }
  return { failures, rows }
}

if (import.meta.main) {
  const { failures, rows } = checkSizes(process.cwd())
  for (const row of rows) console.log(row)
  for (const failure of failures) console.error(`size: ${failure}`)
  process.exit(failures.length === 0 ? 0 : 1)
}
