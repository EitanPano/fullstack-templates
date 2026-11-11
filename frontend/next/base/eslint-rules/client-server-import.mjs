import { relative } from 'node:path'
import { dirname, normalize } from 'node:path/posix'

// A Client Component ('use client') reaches the server only through a server action: it may import
// from actions/ (and types, which are erased), never a read in services/ or the session code in
// core/auth/, because that code would be bundled for the browser.
const SERVER_ONLY = /^src\/(services|core\/auth)(\/|$)/

// The specifier as a path from the project root, or null for a package. Handles the `@/` alias
// and relative specifiers.
export function resolveFromRoot(source, file) {
  if (source.startsWith('@/')) return normalize(`src/${source.slice(2)}`)
  if (source.startsWith('.')) return normalize(`${dirname(file)}/${source}`)
  return null
}

export const projectFile = (context) =>
  relative(context.cwd, context.filename).replaceAll('\\', '/')

const isTypeOnly = (node) =>
  (node.importKind ?? node.exportKind) === 'type' ||
  (node.specifiers?.length > 0 &&
    node.specifiers.every((s) => (s.importKind ?? s.exportKind) === 'type'))

export const clientServerImport = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      onlyAction:
        'a Client Component imports no value from services/ or core/auth/: call it in a Server Component and pass the data down, or call an action from actions/',
    },
  },
  create(context) {
    let isClient = false
    const file = projectFile(context)
    const check = (node) => {
      if (!isClient || node.source == null || isTypeOnly(node)) return
      if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
      const resolved = resolveFromRoot(String(node.source.value), file)
      if (resolved !== null && SERVER_ONLY.test(resolved)) {
        context.report({ node, messageId: 'onlyAction' })
      }
    }
    return {
      Program(node) {
        isClient = node.body.some(
          (statement) =>
            statement.type === 'ExpressionStatement' && statement.directive === 'use client',
        )
      },
      ImportDeclaration: check,
      // A re-export pulls the module into the client bundle just like an import.
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      // import('@/services/x') pulls the module into the client bundle too.
      ImportExpression: check,
    }
  },
}
