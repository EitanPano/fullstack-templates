// @vitest-environment node
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// One violation and one allowed case per rule of the layer map (AGENTS.md › Layers), linted
// through the real eslint.config.mjs. A rule that stops firing fails here. The import rules read
// the specifier, so the files the snippets import need not exist.
const root = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: fileURLToPath(new URL('../../eslint.config.mjs', import.meta.url)),
})

async function lint(path: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${root}/${path}` })
  return (result?.messages ?? []).map((message) => `${message.ruleId}: ${message.message}`)
}

const refused = async (path: string, code: string, text: string) => {
  const messages = await lint(path, code)
  expect(messages.join('\n')).toContain(text)
}
const allowed = async (path: string, code: string) => {
  expect(await lint(path, code)).toEqual([])
}

describe('layer map: refused', () => {
  it.each([
    ['core', 'src/core/x.ts', "import { a } from '../ui'", 'core/ is the kernel'],
    ['core', 'src/core/x.ts', "import { a } from '../frame/run'", 'never imports frame/'],
    [
      'core',
      'src/core/x.ts',
      "import { a } from '../modules/x/host'",
      'only entries/ imports modules/',
    ],
    ['core', 'src/core/x.ts', "import { a } from '../entries/index'", 'nothing imports entries/'],
    [
      'transport',
      'src/transport/x.ts',
      "import { a } from '../core'",
      'transport/ is the network door',
    ],
    [
      'transport',
      'src/transport/x.ts',
      "import { a } from '../ui'",
      'transport/ is the network door',
    ],
    ['ui', 'src/ui/x.ts', "import { a } from '../transport'", 'ui/ draws'],
    ['ui', 'src/ui/x.ts', "import { a } from '../core'", 'ui/ draws'],
    ['ui', 'src/ui/x.ts', "import { a } from '../frame'", 'never imports frame/'],
    [
      'protocol',
      'src/protocol/x.ts',
      "import { a } from '../core'",
      'protocol/ imports contract/ only',
    ],
    [
      'frame',
      'src/frame/x.ts',
      "import { a } from '../ui'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'frame',
      'src/frame/x.ts',
      "import { a } from '../transport'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'frame',
      'src/frame/x.ts',
      "import { a } from '../core/sdk'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'entries/index',
      'src/entries/index.ts',
      "import { a } from '../frame'",
      'never imports frame/',
    ],
    [
      'entries/cdn',
      'src/entries/cdn.ts',
      "import { a } from '../frame/run'",
      'never imports frame/',
    ],
    [
      'entries/frame',
      'src/entries/frame.ts',
      "import { a } from '../ui'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'entries/frame',
      'src/entries/frame.ts',
      "import { a } from '../core'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'module host',
      'src/modules/ad/host.ts',
      "import { a } from '../../frame'",
      'never imports frame/',
    ],
    [
      'module host',
      'src/modules/ad/host.ts',
      "import { a } from './frame'",
      'never imports frame/',
    ],
    [
      'module frame',
      'src/modules/ad/frame.ts',
      "import { a } from '../../ui'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'module frame',
      'src/modules/ad/frame.ts',
      "import { a } from '../../core'",
      'frame/ never imports ui/, transport/ or core/',
    ],
    [
      'module frame',
      'src/modules/ad/frame.ts',
      "import { a } from './host'",
      'never imports a host half',
    ],
    [
      'module',
      'src/modules/ad/host.ts',
      "import { a } from '../other/host'",
      'a module never imports another module',
    ],
    [
      'module',
      'src/modules/ad/frame.ts',
      "import { a } from '../other/frame'",
      'a module never imports another module',
    ],
    [
      'module',
      'src/modules/ad/host.ts',
      "import { a } from '../../entries/index'",
      'nothing imports entries/',
    ],
  ])('%s: %s', async (_layer, path, code, text) => {
    await refused(path, `${code}\nvoid a\n`, text)
  })
})

describe('layer map: allowed', () => {
  it.each([
    [
      'core takes transport, protocol and contract',
      'src/core/x.ts',
      "import { a } from '../transport'\nimport { b } from '../protocol'\nimport type { SdkConfig } from '../contract'\nexport type C = SdkConfig\nvoid [a, b]",
    ],
    [
      'transport takes protocol and contract',
      'src/transport/x.ts',
      "import { a } from '../protocol'\nimport type { SdkConfig } from '../contract'\nexport type C = SdkConfig\nvoid a",
    ],
    ['ui takes protocol', 'src/ui/x.ts', "import { a } from '../protocol'\nvoid a"],
    [
      'frame takes protocol and contract',
      'src/frame/x.ts',
      "import { a } from '../protocol'\nimport type { SdkConfig } from '../contract'\nexport type C = SdkConfig\nvoid a",
    ],
    ['frame files take each other', 'src/frame/x.ts', "import { a } from './meter'\nvoid a"],
    ['entries/index takes core', 'src/entries/index.ts', "import { a } from '../core'\nvoid a"],
    ['entries/cdn takes core', 'src/entries/cdn.ts', "import { a } from '../core'\nvoid a"],
    ['entries/frame takes frame', 'src/entries/frame.ts', "import { a } from '../frame'\nvoid a"],
    [
      'entries takes modules',
      'src/entries/index.ts',
      "import { a } from '../modules/ad/host'\nvoid a",
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
      "import { a } from './types'\nvoid a",
    ],
  ])('%s', async (_name, path, code) => {
    await allowed(path, code)
  })
})

describe('the network door', () => {
  const call = "export const f = () => fetch('https://api.example.test')\n"

  it.each([
    ['core', 'src/core/x.ts'],
    ['ui', 'src/ui/x.ts'],
    ['entries', 'src/entries/index.ts'],
    ['a module', 'src/modules/ad/host.ts'],
    ['the frame outside its sender', 'src/frame/run.ts'],
  ])('refuses fetch in %s', async (_name, path) => {
    await refused(path, call, 'only transport/ and frame/sender.ts call the network')
  })

  it('refuses window.fetch and globalThis.fetch', async () => {
    await refused('src/core/x.ts', 'export const f = () => window.fetch("x")\n', 'only transport/')
    await refused(
      'src/core/x.ts',
      'export const f = () => globalThis.fetch("x")\n',
      'only transport/',
    )
  })

  it('refuses sendBeacon and XMLHttpRequest', async () => {
    await refused(
      'src/core/x.ts',
      'export const f = () => navigator.sendBeacon("x")\n',
      'sendBeacon',
    )
    await refused(
      'src/core/x.ts',
      'export const f = () => new XMLHttpRequest()\n',
      'only transport/',
    )
  })

  it.each([
    ['transport', 'src/transport/index.ts'],
    ['the frame sender', 'src/frame/sender.ts'],
  ])('allows fetch in %s', async (_name, path) => {
    await allowed(path, call)
  })
})

describe('untrusted strings', () => {
  it.each([
    ['innerHTML', 'export const f = (el: Element, s: string) => { el.innerHTML = s }\n'],
    ['outerHTML', 'export const f = (el: Element, s: string) => { el.outerHTML = s }\n'],
    [
      'insertAdjacentHTML',
      'export const f = (el: Element, s: string) => el.insertAdjacentHTML("beforeend", s)\n',
    ],
    ['document.write', 'export const f = (s: string) => document.write(s)\n'],
  ])('refuses %s on both sides', async (_name, code) => {
    await refused('src/frame/x.ts', code, 'text reaches the DOM as a text node')
    await refused('src/ui/x.ts', code, 'text reaches the DOM as a text node')
  })

  it('allows textContent and text nodes', async () => {
    await allowed(
      'src/frame/x.ts',
      'export const f = (el: Element, s: string) => { el.textContent = s }\n',
    )
  })
})
