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
  '.webmanifest',
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

// The tokens that name the plan's server; the generator defines none of them in a plan without one.
export const SERVER_PLACEHOLDERS: readonly string[] = [
  'SERVER_DIR',
  'SERVER_PORT',
  'SERVER_DEV_COMMAND',
  'SERVER_START_COMMAND',
  'SERVER_E2E_DB_COMMAND',
  'SERVER_E2E_DATABASE_URL',
]

// The tokens of an sdk package: the API package of a plan that holds one is given the first four,
// the sdk package its global (ADR 0020 K3).
export const SDK_PLACEHOLDERS: readonly string[] = [
  'SDK_DIR',
  'SDK_PATH',
  'SDK_OUT',
  'SDK_PORT',
  'SDK_GLOBAL',
]

// The tokens the generator itself defines, beside the ones a template declares.
export const GENERATED_PLACEHOLDERS: readonly string[] = [
  'PROJECT_NAME',
  'PACKAGE_DIR',
  'PORT',
  ...SERVER_PLACEHOLDERS,
  'FRONTEND_DIR',
  // A serverless package's view of the frontend (ADR 0014 K4).
  'FRONTEND_PATH',
  'FRONTEND_OUT',
  // A serverless package's list of every frontend, a JSON array (ADR 0015 F2).
  'FRONTENDS',
  // The same package's local host map, `<dir>.localhost=<dir>` per frontend, comma-separated.
  'FRONTEND_HOSTS',
  ...SDK_PLACEHOLDERS,
  // The brand of a frontend package (lib/brand.ts builds the values).
  'PROJECT_DISPLAY_NAME',
  'THEME_LIGHT',
  'THEME_DARK',
  'THEME_RADIUS',
  'THEME_DEFAULT',
  'THEME_DENSITY',
  'THEME_FONT',
  'THEME_FONT_STACK',
]

// The name of the sdk's one global: its directory's last segment, a leading `sdk-` dropped, in
// PascalCase, plus the suffix `Sdk` so a host's own `Chat` or `React` is not taken (`sdk-ads` is
// `AdsSdk`; `sdk` and `ads-sdk` end in the suffix already: `Sdk`, `AdsSdk`).
export function sdkGlobal(dir: string): string {
  const last = dir.split('/').at(-1) ?? dir
  const name = last.startsWith('sdk-') ? last.slice('sdk-'.length) : last
  const pascal = name
    .split('-')
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return pascal.endsWith('Sdk') ? pascal : `${pascal}Sdk`
}

// The reason a directory cannot name the sdk's global, or null: the name after `sdk-` must start
// with a letter, so the global is a JavaScript identifier.
export function sdkGlobalProblem(dir: string): string | null {
  const global = sdkGlobal(dir)
  const last = dir.split('/').at(-1) ?? dir
  const after = last.startsWith('sdk-') ? last.slice('sdk-'.length) : last
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(global) && /^[a-z]/.test(after)) return null
  return `sdk directory "${dir}": the name after sdk- must start with a letter (the global is window.<Name>Sdk)`
}

export function substitutePlaceholders(
  content: string,
  values: Readonly<Record<string, string>>,
): string {
  return content.replace(/__([A-Z][A-Z0-9_]*?)__/g, (token, name: string) =>
    Object.hasOwn(values, name) ? (values[name] as string) : token,
  )
}

// A Markdown formatter rewrites `__NAME__` as bold `**NAME**`, which no substitution matches, so
// that spelling of a declared name counts as left over too.
export function findLeftoverPlaceholder(content: string, names: readonly string[]): string | null {
  for (const name of names) {
    for (const token of [`__${name}__`, `**${name}**`]) {
      if (content.includes(token)) return token
    }
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
