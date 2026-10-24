import path from 'node:path'

export type CommentSyntax = readonly [open: string, close: string]

export class MarkerError extends Error {
  readonly where: string

  constructor(where: string, message: string) {
    super(`${where}: ${message}`)
    this.name = 'MarkerError'
    this.where = where
  }
}

const SLASH: CommentSyntax = ['//', '']
const HASH: CommentSyntax = ['#', '']
const HTML: CommentSyntax = ['<!--', ' -->']
const DASH: CommentSyntax = ['--', '']

const BY_EXTENSION: Readonly<Record<string, CommentSyntax>> = {
  ...Object.fromEntries(
    '.ts .tsx .mts .cts .js .mjs .cjs .cs .java .php .go .rs .kt .swift .scss'
      .split(' ')
      .map((ext) => [ext, SLASH]),
  ),
  ...Object.fromEntries(
    '.yml .yaml .toml .py .rb .sh .conf .example .gitignore .dockerignore .editorconfig .properties'
      .split(' ')
      .map((ext) => [ext, HASH]),
  ),
  ...Object.fromEntries('.md .html .vue .xml'.split(' ').map((ext) => [ext, HTML])),
  '.sql': DASH,
}

// Dotfiles have no extension in path.extname, so they are matched by name.
const BY_BASENAME: Readonly<Record<string, CommentSyntax>> = Object.fromEntries(
  ['Dockerfile', '.gitignore', '.dockerignore', '.editorconfig', '.env.example'].map((name) => [
    name,
    HASH,
  ]),
)

// The one list of file types the generator processes; placeholders.ts derives its text types from
// these, so a type with a comment syntax can never be skipped.
export const COMMENT_EXTENSIONS: readonly string[] = Object.keys(BY_EXTENSION)
export const COMMENT_BASENAMES: readonly string[] = Object.keys(BY_BASENAME)

export function commentSyntaxFor(filePath: string): CommentSyntax | undefined {
  return BY_BASENAME[path.basename(filePath)] ?? BY_EXTENSION[path.extname(filePath)]
}

const NAME = '[a-z][a-z0-9-]*(?::[a-z0-9-]+)?'

const escapeRegExp = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

const GENERIC_OPENS = ['//', '#', '<!--']

// A marker as written in a comment; plain text such as an `@auth/core` import is not one. The
// file's own comment opener counts too, so `-- @x` is a marker in .sql and plain text elsewhere.
export function findLeftoverMarker(content: string, syntax?: CommentSyntax): string | null {
  const opens = syntax === undefined ? GENERIC_OPENS : [...new Set([...GENERIC_OPENS, syntax[0]])]
  const pattern = new RegExp(
    String.raw`(?:${opens.map(escapeRegExp).join('|')})[ \t]*@${NAME}(?=[ \t]*(?:-->)?[ \t\r]*$)`,
    'm',
  )
  return pattern.exec(content)?.[0] ?? null
}

type Block = { name: string; negated: boolean; where: string }

export function applyMarkers(
  content: string,
  [open, close]: CommentSyntax,
  where: string,
  selections: Readonly<Record<string, boolean>>,
): string {
  // Group 1 is the code before the marker (empty for a block marker on its own line).
  const marker = new RegExp(
    String.raw`^(.*\S[ \t]+|[ \t]*)${escapeRegExp(open)} @(${NAME})${escapeRegExp(close)}[ \t]*$`,
  )

  // `@no<name>` negates `<name>`; a name that is itself selected wins, so `notify` stays a name.
  const resolve = (raw: string, at: string) => {
    if (Object.hasOwn(selections, raw)) return { name: raw, negated: false }
    if (raw.startsWith('no') && Object.hasOwn(selections, raw.slice(2))) {
      return { name: raw.slice(2), negated: true }
    }
    throw new MarkerError(at, `unknown marker name "${raw}"`)
  }
  const keeps = ({ name, negated }: { name: string; negated: boolean }) =>
    negated ? !selections[name] : selections[name] === true

  const kept: string[] = []
  let block: Block | undefined
  for (const [index, raw] of content.split('\n').entries()) {
    const line = raw.replace(/\r$/, '')
    const at = `${where}:${String(index + 1)}`
    const found = marker.exec(line)
    const prefix = found?.[1] ?? ''
    const token = found?.[2] ?? ''
    const edge = prefix.trim() === '' ? /^(.+)-(start|end)$/.exec(token) : null

    if (found !== null && edge !== null) {
      const resolved = resolve(edge[1] ?? '', at)
      if (edge[2] === 'start') {
        if (block !== undefined) throw new MarkerError(at, 'a marker block inside another')
        block = { ...resolved, where: at }
      } else {
        if (
          block === undefined ||
          block.name !== resolved.name ||
          block.negated !== resolved.negated
        ) {
          throw new MarkerError(at, 'unbalanced marker end')
        }
        block = undefined
      }
      continue
    }
    if (block !== undefined && !keeps(block)) continue
    if (found === null) {
      kept.push(raw)
    } else if (keeps(resolve(token, at))) {
      // A CRLF checkout keeps its carriage return.
      kept.push(prefix.replace(/[ \t]+$/, '') + raw.slice(line.length))
    }
  }
  if (block !== undefined) throw new MarkerError(block.where, 'marker block is never closed')
  return kept.join('\n')
}
