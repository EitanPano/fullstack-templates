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
  'src/entries/global-name.ts',
  'src/core/index.ts',
  'src/core/sdk.ts',
  'src/transport/index.ts',
  'src/transport/x.ts',
  'src/contract/index.ts',
  'src/protocol/index.ts',
  'src/ui/index.ts',
  'src/ui/x.ts',
  'src/frame/index.ts',
  'src/frame/run.ts',
  'src/frame/meter.ts',
  'src/frame/sender.ts',
  'src/frame/dom.ts',
  'src/frame/x.ts',
  'src/modules/ad/host.ts',
  'src/modules/ad/frame.ts',
  'src/modules/ad/types.ts',
  'src/modules/ad/host/part.ts',
  'src/modules/ad/frame/part.ts',
  'src/modules/other/host.ts',
  'src/modules/other/frame.ts',
  'src/modules/other/types.ts',
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
    ['core to ui', 'src/core/x.ts', "import { a } from '../ui/x'", KERNEL],
    ['core to frame', 'src/core/x.ts', "import { a } from '../frame/run'", KERNEL],
    ['core to a module', 'src/core/x.ts', "import { a } from '../modules/ad/host'", KERNEL],
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
    ['frame to a module', 'src/frame/x.ts', "import { a } from '../modules/ad/frame'", IN_FRAME],
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
      "import { a } from '../modules/ad/frame'",
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
      "import { a } from '../modules/ad/host'",
      'registers frame halves',
    ],
    ['a host half to frame/', 'src/modules/ad/host.ts', "import { a } from '../../frame/run'", OWN],
    [
      'a host half to its frame half',
      'src/modules/ad/host.ts',
      "import { a } from './frame'",
      "never imports a module's frame half",
    ],
    ['a frame half to ui', 'src/modules/ad/frame.ts', "import { a } from '../../ui/x'", OWN],
    ['a frame half to core', 'src/modules/ad/frame.ts', "import { a } from '../../core/sdk'", OWN],
    [
      'a frame half to transport',
      'src/modules/ad/frame.ts',
      "import { a } from '../../transport/x'",
      OWN,
    ],
    [
      'a frame half to its host half',
      'src/modules/ad/frame.ts',
      "import { a } from './host'",
      "never imports a module's host half",
    ],
    [
      'a shared file to a half',
      'src/modules/ad/types.ts',
      "import { a } from './host'",
      'imports neither half',
    ],
    [
      'a module to entries',
      'src/modules/ad/host.ts',
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
    ['a plain sibling', 'src/modules/ad/host.ts', "import { a } from '../other/host'"],
    ['through modules/', 'src/modules/ad/host.ts', "import { a } from '../../modules/other/host'"],
    ['with a leading ./', 'src/modules/ad/host.ts', "import { a } from './../other/host'"],
    ['from a nested folder', 'src/modules/ad/host/part.ts', "import { a } from '../../other/host'"],
    [
      'the other frame half',
      'src/modules/ad/frame.ts',
      "import { a } from '../../modules/other/frame'",
    ],
    ['a shared file', 'src/modules/ad/types.ts', "import { a } from '../other/types'"],
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
    ['frame files take each other', 'src/frame/x.ts', "import { a } from './meter'\nvoid a"],
    ['entries/index takes core', 'src/entries/index.ts', "import { a } from '../core'\nvoid a"],
    ['entries/cdn takes core', 'src/entries/cdn.ts', "import { a } from '../core'\nvoid a"],
    ['entries/frame takes frame', 'src/entries/frame.ts', "import { a } from '../frame'\nvoid a"],
    [
      'entries/index takes a module host half',
      'src/entries/index.ts',
      "import { a } from '../modules/ad/host'\nvoid a",
    ],
    [
      'entries/cdn takes a module host half',
      'src/entries/cdn.ts',
      "import { a } from '../modules/ad/host'\nvoid a",
    ],
    [
      'entries/frame takes a module frame half',
      'src/entries/frame.ts',
      "import { a } from '../modules/ad/frame'\nvoid a",
    ],
    [
      'a module host takes core, transport, ui and protocol',
      'src/modules/ad/host.ts',
      "import { a } from '../../core'\nimport { b } from '../../transport'\nimport { c } from '../../ui'\nimport { d } from '../../protocol'\nvoid [a, b, c, d]",
    ],
    [
      'a module frame takes frame and protocol',
      'src/modules/ad/frame.ts',
      "import { a } from '../../frame'\nimport { b } from '../../protocol'\nvoid [a, b]",
    ],
    [
      'a module takes its own files',
      'src/modules/ad/host.ts',
      "import { a } from './types'\nimport { b } from './host/part'\nvoid [a, b]",
    ],
    [
      'a module half takes its own nested folder',
      'src/modules/ad/frame.ts',
      "import { a } from './frame/part'\nvoid a",
    ],
    [
      'a shared file takes protocol and contract',
      'src/modules/ad/types.ts',
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
    ['a module', 'src/modules/ad/host.ts'],
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
  ])('refuses %s on both sides', async (_name, body) => {
    const code = `declare const el: any, s: string\nexport const f = () => { void el; ${body} }\n`
    await refused('src/frame/x.ts', code, TEXT)
    await refused('src/ui/x.ts', code, TEXT)
  })

  it.each([
    ['href', 'el.setAttribute("href", s)'],
    ['src', 'el.setAttribute("src", s)'],
    ['srcdoc', 'el.setAttribute("srcdoc", s)'],
    ['style', 'el.setAttribute("style", s)'],
    ['an on handler', 'el.setAttribute("onclick", s)'],
    ['a name held in a variable', 'el.setAttribute(name, s)'],
  ])('refuses setAttribute for %s', async (_name, body) => {
    const code = `declare const el: any, s: string, name: string\nexport const f = () => { void name; ${body} }\n`
    await refused('src/frame/x.ts', code, LINK)
    await refused('src/modules/ad/host.ts', code, LINK)
  })

  it.each([
    ['href', 'x.href = s'],
    ['src', 'x.src = s'],
    ['srcdoc', 'x.srcdoc = s'],
  ])('refuses an assignment to the %s property', async (_name, body) => {
    const code = `declare const x: any, s: string\nexport const f = () => { ${body} }\n`
    await refused('src/frame/x.ts', code, 'an address is set only by createLink')
    await refused('src/modules/ad/host.ts', code, 'an address is set only by createLink')
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
    ['the frame renderer', 'src/ui/frame-renderer.ts', 'src'],
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
