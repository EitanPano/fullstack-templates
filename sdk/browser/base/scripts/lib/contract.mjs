// `bun run api:types`: the contract step, closed on failure. An SDK reads the server's contract
// for the /api/sdk/ operations only (ADR 0020 K4), and the tool's own filter falls back to the
// whole document when nothing matches. So this script (1) refuses a document with no operation
// under /api/sdk/, writing nothing, (2) runs @hey-api/openapi-ts with the package's config, and
// (3) restores the previous src/contract/ when the output names any path outside /api/sdk/.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PREFIX = '/api/sdk/'
const NO_SDK = `the server's contract has no ${PREFIX} path: an SDK needs a server with the SDK namespace`

function hasSdkOperation(document) {
  const paths = document?.paths ?? {}
  return Object.keys(paths).some((path) => path.startsWith(PREFIX))
}

function snapshot(dir) {
  const files = new Map()
  if (!existsSync(dir)) return files
  for (const name of readdirSync(dir)) files.set(name, readFileSync(join(dir, name)))
  return files
}

function restore(dir, files) {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) if (!files.has(name)) rmSync(join(dir, name))
  for (const [name, content] of files) writeFileSync(join(dir, name), content)
}

// Every /api/ address in the output (the `url` of each operation's data type) is an SDK one.
function outsiders(dir) {
  const found = new Set()
  for (const name of readdirSync(dir)) {
    const text = readFileSync(join(dir, name), 'utf8')
    for (const match of text.matchAll(/\/api\/[^\s"'`)}]*/g)) {
      if (!match[0].startsWith(PREFIX)) found.add(match[0])
    }
  }
  return [...found]
}

function generateWithTool(root) {
  const bin = join(
    fileURLToPath(new URL('../../node_modules/.bin/', import.meta.url)),
    'openapi-ts',
  )
  execSync(`"${bin}"`, { cwd: root, stdio: 'inherit' })
}

export async function runContract({ root, generate = generateWithTool }) {
  const config = await import(pathToFileURL(join(root, 'openapi-ts.config.ts')).href)
  let document
  try {
    document = JSON.parse(readFileSync(join(root, config.CONTRACT_INPUT), 'utf8'))
  } catch (error) {
    return { ok: false, message: `cannot read ${config.CONTRACT_INPUT}: ${error.message}` }
  }
  if (!hasSdkOperation(document)) return { ok: false, message: NO_SDK }

  const dir = join(root, 'src', 'contract')
  const before = snapshot(dir)
  try {
    generate(root)
    const leaked = outsiders(dir)
    if (leaked.length > 0) {
      restore(dir, before)
      return {
        ok: false,
        message: `the generated contract names a path outside ${PREFIX}: ${leaked.join(', ')}`,
      }
    }
  } catch (error) {
    restore(dir, before)
    return { ok: false, message: `the contract tool failed: ${error.message}` }
  }
  return { ok: true, message: 'contract: only /api/sdk/ types written' }
}
