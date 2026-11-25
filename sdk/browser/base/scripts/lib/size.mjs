// The size budget: a byte count per output, read from package.json (`sdk.sizeBudget`). A key may
// say `v{major}`, which stands for the major of the package's own version, so a release does not
// rename keys. It fails over a number, on a budgeted output that was not built, on a package with
// no budget and on a `.js` file in `dist/cdn/v<major>/` that has no budget.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function checkSizes(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const major = String(pkg.version ?? '').split('.')[0]
  const budget = pkg.sdk?.sizeBudget ?? {}
  const files = Object.entries(budget).map(([key, limit]) => [
    key.split('{major}').join(major),
    limit,
  ])
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
  // A new output (a chunk loaded on demand) is a cost to the host: it needs a budget of its own.
  const served = join(root, 'dist', 'cdn', `v${major}`)
  if (existsSync(served)) {
    const budgeted = new Set(files.map(([file]) => file))
    for (const name of readdirSync(served)) {
      const file = `dist/cdn/v${major}/${name}`
      if (name.endsWith('.js') && !budgeted.has(file)) failures.push(`${file}: has no size budget`)
    }
  }
  return { failures, rows }
}
