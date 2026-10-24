import path from 'node:path'
import { COMMENT_BASENAMES, COMMENT_EXTENSIONS } from './markers'

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yml',
  '.yaml',
  '.md',
  '.toml',
  '.css',
  '.html',
  '.txt',
  '.conf',
  '.example',
  '.sql',
  '.py',
  '.cs',
  '.java',
  '.php',
  '.xml',
  '.properties',
  '.svg',
  ...COMMENT_EXTENSIONS,
])

// bun.lock is text because it records the package name, which carries a placeholder.
const TEXT_BASENAMES: ReadonlySet<string> = new Set([
  'Dockerfile',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.prettierrc',
  '.prettierignore',
  '.env.example',
  '.gitattributes',
  'bun.lock',
  ...COMMENT_BASENAMES,
])

export function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath)
  return TEXT_BASENAMES.has(base) || TEXT_EXTENSIONS.has(path.extname(base))
}

// The tokens the generator itself defines, beside the ones a template declares.
export const GENERATED_PLACEHOLDERS: readonly string[] = [
  'PROJECT_NAME',
  'PACKAGE_DIR',
  'PORT',
  'SERVER_DIR',
  'SERVER_PORT',
  'SERVER_DEV_COMMAND',
  'FRONTEND_DIR',
]

export function substitutePlaceholders(
  content: string,
  values: Readonly<Record<string, string>>,
): string {
  return content.replace(/__([A-Z][A-Z0-9_]*?)__/g, (token, name: string) =>
    Object.hasOwn(values, name) ? (values[name] as string) : token,
  )
}

export function findLeftoverPlaceholder(content: string, names: readonly string[]): string | null {
  for (const name of names) {
    const token = `__${name}__`
    if (content.includes(token)) return token
  }
  return null
}

export function toProjectName(raw: string): string {
  const name = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return name === '' ? 'app' : name
}

export function placeholderValues(projectName: string): Record<string, string> {
  return { PROJECT_NAME: projectName }
}
