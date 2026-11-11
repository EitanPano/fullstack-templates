import { dirname } from 'node:path/posix'

import { projectFile, resolveFromRoot } from './client-server-import.mjs'

// A `_components/` folder belongs to the route folder that holds it and the routes below it: a file
// in that folder or any folder under it may import from it. A sibling route, a parent route or code
// outside app/ may not; a piece two such routes share moves to components/app-<name>.
export const routeComponents = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      foreign:
        'a _components/ file belongs to its route folder and the routes below it: move a piece two routes share to components/app-<name>',
    },
  },
  create(context) {
    const importerDir = dirname(projectFile(context))
    const check = (node) => {
      if (node.source == null || node.source.type !== 'Literal') return
      if (typeof node.source.value !== 'string') return
      const resolved = resolveFromRoot(String(node.source.value), projectFile(context))
      if (resolved === null) return
      const segments = resolved.split('/')
      const at = segments.indexOf('_components')
      if (at === -1) return
      const holder = segments.slice(0, at).join('/')
      const inside = importerDir === holder || importerDir.startsWith(`${holder}/`)
      if (!inside) context.report({ node, messageId: 'foreign' })
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      // import('../other/_components/x') loads the module just like an import.
      ImportExpression: check,
    }
  },
}
