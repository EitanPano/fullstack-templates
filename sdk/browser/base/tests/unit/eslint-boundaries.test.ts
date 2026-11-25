// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'

// One violation and one allowed case per rule of the layer map (AGENTS.md › Layers), linted
// through the real eslint.config.mjs. A rule that stops firing fails here. The boundary rule
// classifies an import by the file it resolves to, so the snippets run in a throwaway project that
// holds every file they import.
const config = fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url))
const tsconfig = readFileSync(fileURLToPath(new URL('../../tsconfig.json', import.meta.url)))
const root = mkdtempSync(join(tmpdir(), 'sdk-boundaries-'))

const FILES = [
  'src/entries/index.ts',
  'src/entries/cdn.ts',
  'src/entries/frame.ts',
  'src/entries/frame-modules.ts',
  'src/entries/global-name.ts',
  'src/entries/host-modules.ts',
  'src/core/index.ts',
  'src/core/sdk.ts',
  'src/transport/index.ts',
  'src/transport/x.ts',
  'src/contract/index.ts',
  'src/protocol/index.ts',
  'src/ui/index.ts',
  'src/ui/x.ts',
  'src/ui/frame.ts',
  'src/frame/index.ts',
  'src/frame/run.ts',
  'src/frame/view.ts',
  'src/frame/sender.ts',
  'src/frame/dom.ts',
  'src/frame/x.ts',
  'src/modules/first/host.ts',
  'src/modules/first/frame.ts',
  'src/modules/first/types.ts',
  'src/modules/first/host/part.ts',
  'src/modules/first/frame/part.ts',
  'src/modules/second/host.ts',
  'src/modules/second/frame.ts',
  'src/modules/second/types.ts',
]
for (const file of FILES) {
  mkdirSync(dirname(join(root, file)), { recursive: true })
  writeFileSync(join(root, file), 'export const a = 1\nexport const b = 1\n')
}
writeFileSync(join(root, 'tsconfig.json'), tsconfig)

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: config,
  overrideConfig: [
    {
      settings: {
        'boundaries/root-path': root,
        // The resolver reads the tsconfig of the project it is given: the throwaway one.
        'import/resolver': { typescript: { project: join(root, 'tsconfig.json') } },
      },
    },
  ],
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

async function lint(path: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) })
  return (result?.messages ?? []).map((message) => `${message.ruleId}: ${message.message}`)
}
const refused = async (path: string, code: string, text: string) => {
  expect((await lint(path, `${code}\n`)).join('\n')).toContain(text)
}
const allowed = async (path: string, code: string) => {
  expect(await lint(path, `${code}\n`)).toEqual([])
}

const KERNEL = 'core/ is the kernel'
const DOOR = 'transport/ is the network door'
const DRAW = 'ui/ draws'
const SHARED = 'protocol/ imports contract/ only'
const IN_FRAME = 'frame/ never imports ui/, transport/ or core/'
const OWN = 'a module imports its own files'
const OTHER = 'a module never imports another module'

describe('layer map: refused', () => {
  it.each([
    ['core to frame', 'src/core/x.ts', "import { a } from '../frame/run'", KERNEL],
    ['core to a module', 'src/core/x.ts', "import { a } from '../modules/first/host'", KERNEL],
    ['core to entries', 'src/core/x.ts', "import { a } from '../entries/index'", KERNEL],
    ['transport to core', 'src/transport/x.ts', "import { a } from '../core/sdk'", DOOR],
    ['transport to ui', 'src/transport/x.ts', "import { a } from '../ui/x'", DOOR],
    ['ui to transport', 'src/ui/x.ts', "import { a } from '../transport/x'", DRAW],
    ['ui to core', 'src/ui/x.ts', "import { a } from '../core/sdk'", DRAW],
    ['ui to frame', 'src/ui/x.ts', "import { a } from '../frame/run'", DRAW],
    ['protocol to core', 'src/protocol/index.ts', "import { a } from '../core/sdk'", SHARED],
    ['frame to ui', 'src/frame/x.ts', "import { a } from '../ui/x'", IN_FRAME],
    ['frame to transport', 'src/frame/x.ts', "import { a } from '../transport/x'", IN_FRAME],
    ['frame to core', 'src/frame/x.ts', "import { a } from '../core/sdk'", IN_FRAME],
    ['frame to a module', 'src/frame/x.ts', "import { a } from '../modules/first/frame'", IN_FRAME],
    [
      'entries/index to frame',
      'src/entries/index.ts',
      "import { a } from '../frame/run'",
      'never imports frame/',
    ],
    [
      'entries/cdn to frame',
      'src/entries/cdn.ts',
      "import { a } from '../frame/run'",
      'never imports frame/',
    ],
    [
      'entries/index to a frame half',
      'src/entries/index.ts',
      "import { a } from '../modules/first/frame'",
      'register a module',
    ],
    [
      'entries/frame to ui',
      'src/entries/frame.ts',
      "import { a } from '../ui/x'",
      'entries/frame.ts runs in the frame',
    ],
    [
      'entries/frame to core',
      'src/entries/frame.ts',
      "import { a } from '../core/sdk'",
      'entries/frame.ts runs in the frame',
    ],
    [
      'entries/frame to a host half',
      'src/entries/frame.ts',
      "import { a } from '../modules/first/host'",
      'registers frame halves',
    ],
    [
      'entries/frame-modules to ui',
      'src/entries/frame-modules.ts',
      "import { a } from '../ui/x'",
      'entries/frame.ts runs in the frame',
    ],
    [
      'entries/frame-modules to core',
      'src/entries/frame-modules.ts',
      "import { a } from '../core/sdk'",
      'entries/frame.ts runs in the frame',
    ],
    [
      'entries/frame-modules to a host half',
      'src/entries/frame-modules.ts',
      "import { a } from '../modules/first/host'",
      'registers frame halves',
    ],
    [
      'entries/frame-modules to entries/host-modules',
      'src/entries/frame-modules.ts',
      "import { a } from './host-modules'",
      'registers frame halves',
    ],
    [
      'entries/frame to entries/host-modules',
      'src/entries/frame.ts',
      "import { a } from './host-modules'",
      'registers frame halves',
    ],
    [
      'entries/index to entries/frame-modules',
      'src/entries/index.ts',
      "import { a } from './frame-modules'",
      'never imports frame/',
    ],
    [
      'entries/cdn to entries/frame-modules',
      'src/entries/cdn.ts',
      "import { a } from './frame-modules'",
      'never imports frame/',
    ],
    [
      'a host half to frame/',
      'src/modules/first/host.ts',
      "import { a } from '../../frame/run'",
      OWN,
    ],
    ['a host half to ui', 'src/modules/first/host.ts', "import { a } from '../../ui/x'", OWN],
    [
      'a host half to transport',
      'src/modules/first/host.ts',
      "import { a } from '../../transport/x'",
      OWN,
    ],
    [
      'a host half to code of core (a value import)',
      'src/modules/first/host.ts',
      "import { a } from '../../core'",
      'a host half is a declaration',
    ],
    [
      'entries/host-modules to frame',
      'src/entries/host-modules.ts',
      "import { a } from '../frame/run'",
      'never imports frame/',
    ],
    [
      'entries/host-modules to a frame half',
      'src/entries/host-modules.ts',
      "import { a } from '../modules/first/frame'",
      'register a module',
    ],
    [
      'a host half to its frame half',
      'src/modules/first/host.ts',
      "import { a } from './frame'",
      "never imports a module's frame half",
    ],
    ['a frame half to ui', 'src/modules/first/frame.ts', "import { a } from '../../ui/x'", OWN],
    [
      'a frame half to core',
      'src/modules/first/frame.ts',
      "import { a } from '../../core/sdk'",
      OWN,
    ],
    [
      'a frame half to transport',
      'src/modules/first/frame.ts',
      "import { a } from '../../transport/x'",
      OWN,
    ],
    [
      'a frame half to its host half',
      'src/modules/first/frame.ts',
      "import { a } from './host'",
      "never imports a module's host half",
    ],
    [
      'a shared file to a half',
      'src/modules/first/types.ts',
      "import { a } from './host'",
      'imports neither half',
    ],
    [
      'a module to entries',
      'src/modules/first/host.ts',
      "import { a } from '../../entries/index'",
      OWN,
    ],
  ])('%s', async (_name, path, code, text) => {
    await refused(path, `${code}\nvoid a`, text)
  })
})

// The regex rules these replace could be passed by how an import was spelled.
describe('a module never imports another module, however it is written', () => {
  it.each([
    ['a plain sibling', 'src/modules/first/host.ts', "import { a } from '../second/host'"],
    [
      'through modules/',
      'src/modules/first/host.ts',
      "import { a } from '../../modules/second/host'",
    ],
    ['with a leading ./', 'src/modules/first/host.ts', "import { a } from './../second/host'"],
    [
      'from a nested folder',
      'src/modules/first/host/part.ts',
      "import { a } from '../../second/host'",
    ],
    [
      'the other frame half',
      'src/modules/first/frame.ts',
      "import { a } from '../../modules/second/frame'",
    ],
    ['a shared file', 'src/modules/first/types.ts', "import { a } from '../second/types'"],
  ])('%s', async (_name, path, code) => {
    await refused(path, `${code}\nvoid a`, OTHER)
  })
})

describe('layer map: allowed', () => {
  it.each([
    [
      'core takes transport, protocol and contract',
      'src/core/x.ts',
      "import { a } from '../transport'\nimport { b } from '../protocol'\nimport { c } from '../contract'\nvoid [a, b, c]",
    ],
    [
      'transport takes protocol and contract',
      'src/transport/x.ts',
      "import { a } from '../protocol'\nvoid a",
    ],
    ['ui takes protocol', 'src/ui/x.ts', "import { a } from '../protocol'\nvoid a"],
    ['frame takes protocol', 'src/frame/x.ts', "import { a } from '../protocol'\nvoid a"],
    ['frame files take each other', 'src/frame/x.ts', "import { a } from './view'\nvoid a"],
    ['entries/index takes core', 'src/entries/index.ts', "import { a } from '../core'\nvoid a"],
    ['entries/cdn takes core', 'src/entries/cdn.ts', "import { a } from '../core'\nvoid a"],
    ['core takes ui', 'src/core/x.ts', "import { a } from '../ui'\nvoid a"],
    [
      'entries/host-modules takes a module host half',
      'src/entries/host-modules.ts',
      "import { a } from '../modules/first/host'\nvoid a",
    ],
    [
      'entries/index takes entries/host-modules',
      'src/entries/index.ts',
      "import { a } from './host-modules'\nvoid a",
    ],
    [
      'entries/frame takes entries/frame-modules',
      'src/entries/frame.ts',
      "import { a } from './frame-modules'\nvoid a",
    ],
    [
      'entries/frame-modules takes frame and a module frame half',
      'src/entries/frame-modules.ts',
      "import { a } from '../frame'\nimport { b } from '../modules/first/frame'\nvoid [a, b]",
    ],
    ['entries/frame takes frame', 'src/entries/frame.ts', "import { a } from '../frame'\nvoid a"],
    [
      'entries/index takes a module host half',
      'src/entries/index.ts',
      "import { a } from '../modules/first/host'\nvoid a",
    ],
    [
      'entries/cdn takes a module host half',
      'src/entries/cdn.ts',
      "import { a } from '../modules/first/host'\nvoid a",
    ],
    [
      'entries/frame takes a module frame half',
      'src/entries/frame.ts',
      "import { a } from '../modules/first/frame'\nvoid a",
    ],
    [
      'a module host takes the types of core, and protocol',
      'src/modules/first/host.ts',
      "import type { a } from '../../core'\nimport { d } from '../../protocol'\nvoid d\nexport type T = typeof a",
    ],
    [
      'a module frame takes frame and protocol',
      'src/modules/first/frame.ts',
      "import { a } from '../../frame'\nimport { b } from '../../protocol'\nvoid [a, b]",
    ],
    [
      'a module takes its own files',
      'src/modules/first/host.ts',
      "import { a } from './types'\nimport { b } from './host/part'\nvoid [a, b]",
    ],
    [
      'a module half takes its own nested folder',
      'src/modules/first/frame.ts',
      "import { a } from './frame/part'\nvoid a",
    ],
    [
      'a shared file takes protocol and contract',
      'src/modules/first/types.ts',
      "import { a } from '../../protocol'\nvoid a",
    ],
  ])('%s', async (_name, path, code) => {
    await allowed(path, code)
  })
})

describe('the network doors', () => {
  const call = "export const f = () => fetch('https://api.example.test')\n"
  const NET = 'only transport/ and frame/sender.ts call the network'

  it.each([
    ['core', 'src/core/x.ts'],
    ['ui', 'src/ui/x.ts'],
    ['entries', 'src/entries/index.ts'],
    ['a module', 'src/modules/first/host.ts'],
    ['the frame outside its sender', 'src/frame/run.ts'],
  ])('refuses fetch in %s', async (_name, path) => {
    await refused(path, call, NET)
  })

  it.each([
    ['window.fetch', 'window.fetch("x")'],
    ['globalThis.fetch', 'globalThis.fetch("x")'],
    ['a document view', 'document.defaultView?.fetch("x")'],
    ['an element view', 'el.ownerDocument.defaultView?.fetch("x")'],
    ['XMLHttpRequest', 'new XMLHttpRequest()'],
    ['WebSocket', 'new WebSocket("wss://x")'],
    ['EventSource', 'new EventSource("x")'],
    ['new Image', 'new Image()'],
    ['window.WebSocket', 'new window.WebSocket("wss://x")'],
  ])('refuses %s outside the doors', async (_name, body) => {
    await refused(
      'src/core/x.ts',
      `declare const el: Element\nexport const f = () => { void el; return ${body} }\n`,
      NET,
    )
  })

  it('refuses sendBeacon everywhere, the doors included', async () => {
    for (const path of ['src/core/x.ts', 'src/transport/x.ts', 'src/frame/sender.ts']) {
      await refused(path, 'export const f = () => navigator.sendBeacon("x")\n', 'sendBeacon')
    }
  })

  it.each([
    ['transport', 'src/transport/index.ts'],
    ['the frame sender', 'src/frame/sender.ts'],
  ])('allows fetch in %s', async (_name, path) => {
    await allowed(path, call)
  })

  it('refuses a WebSocket in a door', async () => {
    await refused('src/transport/x.ts', 'export const f = () => new WebSocket("x")\n', NET)
  })
})

describe('untrusted strings and addresses', () => {
  const TEXT = 'text reaches the DOM as a text node'
  const LINK = 'an address or a style is set only by createLink'

  it.each([
    ['innerHTML', 'el.innerHTML = s'],
    ['outerHTML', 'el.outerHTML = s'],
    ['insertAdjacentHTML', 'el.insertAdjacentHTML("beforeend", s)'],
    ['document.write', 'document.write(s)'],
    ['write on a variable', 'el.write(s)'],
    ['writeln', 'el.writeln(s)'],
    ['srcdoc', 'el.srcdoc = s'],
    ['setHTMLUnsafe', 'el.setHTMLUnsafe(s)'],
    ['DOMParser', 'new DOMParser().parseFromString(s, "text/html")'],
    ['createContextualFragment', 'el.createContextualFragment(s)'],
    ['parseFromString on a parser of any name', 'el.parseFromString(s, "text/html")'],
    ['a DOMParser reached as a member', 'new el.DOMParser().parse(s)'],
    ['parseHTMLUnsafe', 'Document.parseHTMLUnsafe(s)'],
    ['execCommand', 'el.execCommand("insertHTML", false, s)'],
  ])('refuses %s on both sides', async (_name, body) => {
    const code = `declare const el: any, s: string\nexport const f = () => { void el; ${body} }\n`
    await refused('src/frame/x.ts', code, TEXT)
    await refused('src/ui/x.ts', code, TEXT)
  })

  it.each([
    ['href', 'el.setAttribute("href", s)'],
    ['src', 'el.setAttribute("src", s)'],
    ['srcdoc', 'el.setAttribute("srcdoc", s)'],
    ['srcset', 'el.setAttribute("srcset", s)'],
    ['style', 'el.setAttribute("style", s)'],
    ['an on handler', 'el.setAttribute("onclick", s)'],
    ['a name held in a variable', 'el.setAttribute(name, s)'],
  ])('refuses setAttribute for %s', async (_name, body) => {
    const code = `declare const el: any, s: string, name: string\nexport const f = () => { void name; ${body} }\n`
    await refused('src/frame/x.ts', code, LINK)
    await refused('src/modules/first/host.ts', code, LINK)
  })

  it.each([
    ['href', 'x.href = s'],
    ['src', 'x.src = s'],
    ['srcdoc', 'x.srcdoc = s'],
    ['srcset', 'x.srcset = s'],
  ])('refuses an assignment to the %s property', async (_name, body) => {
    const code = `declare const x: any, s: string\nexport const f = () => { ${body} }\n`
    await refused('src/frame/x.ts', code, 'an address is set only by createLink')
    await refused('src/modules/first/host.ts', code, 'an address is set only by createLink')
  })

  it('refuses setAttributeNS, which sets an address under another name', async () => {
    const code =
      'declare const el: any, s: string\nexport const f = () => { el.setAttributeNS(null, "href", s) }\n'
    await refused('src/frame/x.ts', code, LINK)
    await refused('src/modules/first/host.ts', code, LINK)
  })

  it.each([
    ['src', 'Object.assign(el, { src: s })'],
    ['srcset', 'Object.assign(el, { srcset: s })'],
    ['href', 'Object.assign(el, { href: s })'],
    ['srcdoc', 'Object.assign(el, { srcdoc: s })'],
    ['a quoted address key', 'Object.assign(el, { "href": s })'],
    ['innerHTML', 'Object.assign(el, { innerHTML: s })'],
    ['outerHTML', 'Object.assign(el, { outerHTML: s })'],
  ])('refuses Object.assign with %s in its source', async (_name, body) => {
    const code = 'declare const el: any, s: string\nexport const f = () => { ' + body + ' }\n'
    await refused('src/frame/x.ts', code, 'never assign an address or markup through Object.assign')
    await refused(
      'src/modules/first/host.ts',
      code,
      'never assign an address or markup through Object.assign',
    )
  })

  it('allows Object.assign with other properties, and none of the sinks', async () => {
    await allowed(
      'src/frame/x.ts',
      'export const f = (el: Element, s: string) => Object.assign({}, { title: s, text: s }, el)\n',
    )
  })

  it('lets frame/dom.ts and the unit frame assign an address through Object.assign, not markup', async () => {
    for (const path of ['src/frame/dom.ts', 'src/ui/frame.ts']) {
      await allowed(
        path,
        'export const f = (el: object, s: string) => Object.assign(el, { src: s })\n',
      )
      await refused(
        path,
        'export const f = (el: object, s: string) => Object.assign(el, { innerHTML: s })\n',
        'never assign an address or markup through Object.assign',
      )
    }
  })

  it('allows an on-handler property such as port.onmessage', async () => {
    await allowed(
      'src/frame/x.ts',
      'export const f = (port: MessagePort) => { port.onmessage = () => undefined }\n',
    )
  })

  it('allows textContent, text nodes and a plain attribute', async () => {
    await allowed(
      'src/frame/x.ts',
      'export const f = (el: Element, s: string) => { el.textContent = s; el.setAttribute("title", s) }\n',
    )
  })

  it.each([
    ['frame/dom.ts', 'src/frame/dom.ts', 'href'],
    ['the unit frame', 'src/ui/frame.ts', 'src'],
  ])('lets %s set an address', async (_name, path, attribute) => {
    await allowed(
      path,
      `export const f = (el: Record<string, string>, s: string) => { el.${attribute} = s }\n`,
    )
    await allowed(
      path,
      `export const f = (el: Element, s: string) => { el.setAttribute("${attribute}", s) }\n`,
    )
  })
})
