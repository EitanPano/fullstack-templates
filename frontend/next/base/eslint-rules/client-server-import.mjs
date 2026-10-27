// A Client Component ('use client') reaches the server only through a server action: it may
// import `action.ts` from a slice's server/ directory (and types, which are erased), never a
// loader or anything else there, because that code would be bundled for the browser.
const SERVER_DIR = /(^|\/)server\//
const ACTION_FILE = /(^|\/)server\/action(\.[cm]?[jt]sx?)?$/

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
        'a Client Component imports only an action.ts from server/: call the loader in a Server Component (the widget) and pass the data down as props',
    },
  },
  create(context) {
    let isClient = false
    const check = (node) => {
      if (!isClient || node.source == null || isTypeOnly(node)) return
      const source = String(node.source.value)
      if (SERVER_DIR.test(source) && !ACTION_FILE.test(source)) {
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
    }
  },
}
