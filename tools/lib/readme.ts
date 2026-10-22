import type { Catalog } from './catalog'

export const MATRIX_START = '<!-- matrix:start -->'
export const MATRIX_END = '<!-- matrix:end -->'

export class ReadmeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReadmeError'
  }
}

const KIND_ORDER = ['server', 'frontend', 'worker']

const orDash = (items: string[]) => (items.length > 0 ? items.join(', ') : '—')

export function renderMatrix(catalog: Catalog): string {
  const templates = [...catalog.templates.values()].sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.manifest.kind) - KIND_ORDER.indexOf(b.manifest.kind) ||
      a.manifest.id.localeCompare(b.manifest.id),
  )
  const rows = templates.map(({ manifest }) => {
    const flags = Object.keys(manifest.flags ?? {})
    const capabilities = Object.entries(manifest.capabilities ?? {})
      .filter(([, spec]) => spec.providers.length > 0)
      .map(([kind]) => kind)
    return `| \`${manifest.id}\` | ${manifest.kind} | ${manifest.version} | ${orDash(flags)} | ${orDash(capabilities)} | ${manifest.summary} |`
  })
  const stacks = [...catalog.stacks.values()]
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
    .map(({ manifest }) => {
      const packages = manifest.packages.map((pkg) => `\`${pkg.template}\``).join(', ')
      return `| \`${manifest.id}\` | ${packages} | ${manifest.summary} |`
    })
  return [
    '| Template | Kind | Version | Flags | Capabilities | Summary |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '| Stack | Packages | Summary |',
    '| --- | --- | --- |',
    ...stacks,
  ].join('\n')
}

export function replaceMatrix(readme: string, matrix: string): string {
  const start = readme.indexOf(MATRIX_START)
  const end = readme.indexOf(MATRIX_END)
  if (start === -1 || end === -1 || end < start) {
    throw new ReadmeError(`README.md needs ${MATRIX_START} and ${MATRIX_END} markers`)
  }
  return `${readme.slice(0, start + MATRIX_START.length)}\n${matrix}\n${readme.slice(end)}`
}
