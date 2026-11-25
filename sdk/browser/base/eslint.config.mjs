import boundaries from 'eslint-plugin-boundaries'
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The layer map (AGENTS.md › Layers): entries → modules → core | transport | contract |
// protocol | ui | frame. Every import it forbids is a `boundaries/dependencies` error whose
// message names the layer to use. The rule reads the file an import resolves to, so a path's
// spelling (`./../x`, a deeper folder, a longer prefix) changes nothing.
// tests/unit/eslint-boundaries.test.ts lints one violation and one allowed case per rule through
// this file, so a rule that stops firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that
// matches a file replaces the rule for it. `no-restricted-syntax` and its siblings are therefore
// built from the lists below, and each block states everything that applies to it.
const ALL = ['entries', 'core', 'transport', 'contract', 'protocol', 'ui', 'frame', 'module']
const except = (...types) => ALL.filter((type) => !types.includes(type))

// A module's files sit in modules/<name>/: host.ts or host/ is its host half, frame.ts or frame/
// its frame half, any other file is shared by both.
const HOST_HALF = ['host.ts', 'host/**']
const FRAME_HALF = ['frame.ts', 'frame/**']
const HOST_ENTRIES = ['index.ts', 'cdn.ts']

const from = (type, fileInternalPath) => ({
  element: { type, ...(fileInternalPath ? { fileInternalPath } : {}) },
})
const to = (type, extra = {}) => ({ element: { type, ...extra } })

// Later policies override earlier ones, so each forbidden edge comes first and its exceptions after.
const policies = [
  {
    from: from('core'),
    disallow: { to: to(except('core', 'transport', 'protocol', 'contract')) },
    message:
      'core/ is the kernel: it imports transport/, protocol/ and contract/ only, and never the frame, a feature (modules/) or entries/',
  },
  {
    from: from('transport'),
    disallow: { to: to(except('transport', 'protocol', 'contract')) },
    message:
      'transport/ is the network door: it imports protocol/ and contract/ only (core/, ui/ and the rest sit above it)',
  },
  {
    from: from('ui'),
    disallow: { to: to(except('ui', 'protocol', 'contract')) },
    message:
      'ui/ draws: it imports protocol/ and contract/ only; reports go out through callbacks, and it never imports frame/',
  },
  {
    from: from('protocol'),
    disallow: { to: to(except('protocol', 'contract')) },
    message:
      'protocol/ imports contract/ only: both halves share it, so it knows neither (no core/, ui/, transport/ or frame/)',
  },
  {
    from: from('contract'),
    disallow: { to: to(except('contract')) },
    message: 'contract/ is generated and imports nothing',
  },
  {
    from: from('frame'),
    disallow: { to: to(except('frame', 'protocol', 'contract')) },
    message:
      'frame/ never imports ui/, transport/ or core/ (nor a module or entries/): it talks to the host through protocol/ and calls the API through frame/sender',
  },
  // The host entries register host halves; the frame entry registers frame halves.
  {
    from: from('entries', HOST_ENTRIES),
    disallow: { to: to('frame') },
    message:
      'the host half never imports frame/: the halves meet through the protocol/ messages; register a module frame half in entries/frame.ts',
  },
  {
    from: from('entries', HOST_ENTRIES),
    disallow: { to: to('module', { fileInternalPath: FRAME_HALF }) },
    message:
      "entries/index and entries/cdn register a module's host half only; its frame half goes in entries/frame.ts",
  },
  {
    from: from('entries', 'frame.ts'),
    disallow: { to: to(except('entries', 'frame', 'protocol', 'contract', 'module')) },
    message:
      'entries/frame.ts runs in the frame: it imports frame/, protocol/ and the frame halves of modules, never ui/, transport/ or core/',
  },
  {
    from: from('entries', 'frame.ts'),
    disallow: { to: to('module', { fileInternalPath: HOST_HALF }) },
    message: 'entries/frame.ts registers frame halves: a host half is registered in entries/index',
  },
  // A module: its own files, protocol/ and contract/, and by half the layers that half may use.
  {
    from: from('module'),
    disallow: { to: to(except('module', 'protocol', 'contract')) },
    message:
      'a module imports its own files, protocol/ and contract/; a host half adds core/, transport/ and ui/, a frame half adds frame/',
  },
  {
    from: from('module', HOST_HALF),
    allow: { to: to(['core', 'transport', 'ui']) },
  },
  {
    from: from('module', FRAME_HALF),
    allow: { to: to('frame') },
  },
  {
    from: from('module', HOST_HALF),
    disallow: { to: to('module', { fileInternalPath: FRAME_HALF }) },
    message:
      "the host half never imports a module's frame half: the halves meet through the protocol/ messages",
  },
  {
    from: from('module', FRAME_HALF),
    disallow: { to: to('module', { fileInternalPath: HOST_HALF }) },
    message:
      "a frame half never imports a module's host half: the halves meet through the protocol/ messages",
  },
  {
    // A file both halves import must stay neutral, or it is a back door between them.
    from: from('module', ['!(host|frame)*', '!(host|frame)/**']),
    disallow: { to: to('module', { fileInternalPath: [...HOST_HALF, ...FRAME_HALF] }) },
    message:
      'a file both halves share (types.ts) imports neither half, only protocol/ and contract/',
  },
  {
    from: from('module'),
    disallow: {
      to: to('module', { captured: { module: '!{{ from.element.captured.module }}' } }),
    },
    message:
      'a module never imports another module, whatever the path: modules meet through the module bus (ctx.bus) and the events of core/',
  },
]

const NETWORK =
  'only transport/ and frame/sender.ts call the network: send through the transport (host) or the frame sender (frame)'
const TEXT =
  'text reaches the DOM as a text node: use textContent, appendText or createLink (frame/dom), never markup'
const LINK =
  'an address or a style is set only by createLink (frame/dom, https only) or the frame renderer; never through setAttribute'

const SINK_PROPERTIES = [
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'write',
  'writeln',
  'srcdoc',
  'setHTMLUnsafe',
  'createContextualFragment',
].map((property) => ({ property, message: TEXT }))
const BEACON = {
  property: 'sendBeacon',
  message:
    'sendBeacon is never used: with a JSON body it is credentialed and was seen to arrive nowhere; telemetry is JSON with keepalive through transport/',
}
const SINK_GLOBALS = [{ name: 'DOMParser', message: TEXT }]
const DOOR_NAMES = ['XMLHttpRequest', 'WebSocket', 'EventSource', 'Image']
const DOOR_GLOBALS = DOOR_NAMES.map((name) => ({ name, message: NETWORK }))

// `fetch` called on any object (window, globalThis, a document's view) or as a global.
const FETCH_CALL = {
  selector:
    "CallExpression[callee.name='fetch'], CallExpression[callee.type='MemberExpression'][callee.property.name='fetch']",
  message: NETWORK,
}
// `new window.WebSocket(...)` and the like: the names reached through an object.
const DOOR_NEW = {
  selector: `NewExpression[callee.type='MemberExpression'][callee.property.name=/^(${DOOR_NAMES.join('|')})$/]`,
  message: NETWORK,
}
// A name that is not a literal cannot be checked, so it is refused as well.
const SET_ATTRIBUTE = {
  selector:
    "CallExpression[callee.property.name='setAttribute'][arguments.0.type!='Literal'], CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(href|src|srcdoc|style|on.*)$/i]",
  message: LINK,
}

// The property spelling of the same sinks (a.href = x, img.src = x, frame['srcdoc'] = x).
const ADDRESS_ASSIGN = {
  selector:
    "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(href|src|srcdoc)$/], AssignmentExpression[left.type='MemberExpression'][left.property.value=/^(href|src|srcdoc)$/]",
  message:
    'an address is set only by createLink (frame/dom, https only) or the frame renderer (ui/frame-renderer); never by assigning href, src or srcdoc',
}

const rules = (globals, syntax) => ({
  'no-restricted-globals': ['error', ...globals],
  'no-restricted-properties': ['error', ...SINK_PROPERTIES, BEACON],
  'no-restricted-syntax': ['error', ...syntax],
})

const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
}

export default defineConfig(
  globalIgnores(['dist/', 'node_modules/', 'src/contract/', 'tests/e2e/.build/', '.tmp/', 'etc/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  { rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' } },
  {
    files: ['src/**'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: `${import.meta.dirname}/tsconfig.json` },
      },
      'boundaries/include': ['src/**/*'],
      'boundaries/ignore': ['src/globals.d.ts'],
      'boundaries/elements': [
        { type: 'entries', pattern: 'src/entries', partialMatch: false },
        { type: 'core', pattern: 'src/core', partialMatch: false },
        { type: 'transport', pattern: 'src/transport', partialMatch: false },
        { type: 'contract', pattern: 'src/contract', partialMatch: false },
        { type: 'protocol', pattern: 'src/protocol', partialMatch: false },
        { type: 'ui', pattern: 'src/ui', partialMatch: false },
        { type: 'frame', pattern: 'src/frame', partialMatch: false },
        { type: 'module', pattern: 'src/modules/*', partialMatch: false, capture: ['module'] },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'allow', checkInternals: true, policies }],
      // `checkInternals`: a module's halves are files of one element, and the rules between them apply.
      // A file in a folder no layer claims is an error, and so is importing one.
      'boundaries/no-unknown-files': 'error',
      'boundaries/no-unknown-dependencies': 'error',
    },
  },
  // The whole of src/ and the fixture module: no network but the two doors, no markup strings,
  // no address or style set by hand.
  {
    files: ['src/**/*.ts', 'tests/e2e/fixture-module/**/*.ts'],
    rules: rules(
      [{ name: 'fetch', message: NETWORK }, ...DOOR_GLOBALS, ...SINK_GLOBALS],
      [FETCH_CALL, DOOR_NEW, SET_ATTRIBUTE, ADDRESS_ASSIGN],
    ),
  },
  // The two doors may call `fetch`.
  {
    files: ['src/transport/**', 'src/frame/sender.ts'],
    rules: rules([...DOOR_GLOBALS, ...SINK_GLOBALS], [DOOR_NEW, SET_ATTRIBUTE, ADDRESS_ASSIGN]),
  },
  // The one place that builds a link, with its https check, and the iframe's address.
  {
    files: ['src/frame/dom.ts', 'src/ui/frame-renderer.ts'],
    rules: rules(
      [{ name: 'fetch', message: NETWORK }, ...DOOR_GLOBALS, ...SINK_GLOBALS],
      [FETCH_CALL, DOOR_NEW],
    ),
  },
  {
    files: ['scripts/**/*.mjs', 'tests/consumers/**', 'tests/e2e/*.mjs', '*.mjs'],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...NODE_GLOBALS, require: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
)
