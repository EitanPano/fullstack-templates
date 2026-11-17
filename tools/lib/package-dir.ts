import type { TemplateManifest } from './catalog'

// A package directory is one segment, or two joined by a slash (`serverless/<provider>`, ADR 0014 K1).
export const DIR_PATTERN = /^[a-z][a-z0-9-]*(\/[a-z][a-z0-9-]*)?$/

export interface DirMember {
  dir: string
  path: string
  manifest: Pick<TemplateManifest, 'kind' | 'docker'>
}

// The server and a serverless package fill the same role: the API a frontend keys on.
export const isApiKind = (kind: string): boolean => kind === 'server' || kind === 'serverless'

// A template that ships no image has no Compose service, so its dir need not be a service name.
export function shipsImage(manifest: DirMember['manifest']): boolean {
  return manifest.kind !== 'serverless' && manifest.docker !== false
}

// Every rule on the set of packages a plan or a stack holds, as messages; the caller decides how
// to report them.
export function memberProblems(members: readonly DirMember[]): string[] {
  const problems: string[] = []
  for (const member of members) {
    if (!DIR_PATTERN.test(member.dir)) {
      problems.push(`invalid package dir: ${member.dir}`)
    } else if (member.dir.includes('/') && shipsImage(member.manifest)) {
      problems.push(
        `${member.path} has the dir "${member.dir}", but a package that ships a Compose service takes one segment`,
      )
    }
  }
  for (const [i, a] of members.entries()) {
    for (const b of members.slice(i + 1)) {
      for (const [outer, inner] of [
        [a, b],
        [b, a],
      ] as const) {
        if (inner.dir.startsWith(`${outer.dir}/`)) {
          problems.push(
            `package dir "${outer.dir}" would contain package dir "${inner.dir}"; choose another dir`,
          )
        }
      }
    }
  }
  const apis = members.filter((m) => isApiKind(m.manifest.kind))
  if (apis.length > 1) {
    problems.push(
      `a stack takes one server or serverless package, found ${apis.map((m) => m.dir).join(' and ')}`,
    )
  }
  const server = apis.find((m) => m.manifest.kind === 'server')
  for (const member of members) {
    if (member.manifest.docker === false && server !== undefined) {
      problems.push(
        `${member.path} ships no image (docker: false) and cannot join ${server.path}; both deploy modes need an image`,
      )
    }
  }
  return problems
}
