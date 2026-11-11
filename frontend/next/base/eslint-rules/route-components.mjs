import { dirname } from 'node:path/posix'

import { projectFile, resolveFromRoot } from './client-server-import.mjs'

// A `_components/` folder belongs to the route folder that holds it: only a file in that route
// folder, or inside the `_components/` folder itself, may import from it. A piece two routes share
// moves to components/app-<name>.
export const routeComponents = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      foreign:
        'a _components/ file belongs to its route folder: move a piece two routes share to components/app-<name>',
    },
  },
  create(context) {
    const importerDir = dirname(projectFile(context))
    const check = (node) => {
      if (node.source == null) return
      const resolved = resolveFromRoot(String(node.source.value), projectFile(context))
      if (resolved === null) return
      const segments = resolved.split('/')
      const at = segments.indexOf('_components')
      if (at === -1) return
      const holder = segments.slice(0, at).join('/')
      const inside = importerDir === holder || importerDir === `${holder}/_components` ||
        importerDir.startsWith(`${holder}/_components/`)
      if (!inside) context.report({ node, messageId: 'foreign' })
    }
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    }
  },
}
