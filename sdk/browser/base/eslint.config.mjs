import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

// The layer map (AGENTS.md › Layers): entries → modules → core | transport | contract |
// protocol | ui | frame. Every import it forbids is a `no-restricted-imports` error whose message
// names the layer to use. tests/unit/eslint-boundaries.test.ts lints one violation and one
// allowed case per rule through this file, so a rule that stops firing fails the suite.
//
// ESLint flat config does not merge one rule's options across blocks: the last block that matches
// a file replaces the rule for it. Each zone below therefore states its whole list of bans.
const layer = (name) => `(^|/)${name}(/|$)`

const NO_ENTRIES = {
  regex: layer('entries'),
  message: 'nothing imports entries/: they are the top of the layer map',
}
const NO_MODULES = {
  regex: layer('modules'),
  message: 'only entries/ imports modules/: a layer below never knows a feature',
}
const NO_FRAME = {
  regex: layer('frame'),
  message:
    'the host half never imports frame/ (nor a module frame half): the halves meet through the protocol/ messages',
}
const NO_HOST_HALF = {
  regex: layer('host'),
  message: 'a frame half never imports a host half: the halves meet through the protocol/ messages',
}
const FRAME_ONLY = (name) => ({
  regex: layer(name),
  message:
    'frame/ never imports ui/, transport/ or core/: it talks to the host through protocol/ and calls the API through frame/sender',
})
const NO_CORE = (message) => ({ regex: layer('core'), message })
const NO_TRANSPORT = (message) => ({ regex: layer('transport'), message })
const NO_UI = (message) => ({ regex: layer('ui'), message })

const KERNEL = 'core/ is the kernel: it imports transport/, protocol/ and contract/ only'
const DOOR = 'transport/ is the network door: it imports protocol/ and contract/ only'
const DRAW = 'ui/ draws: it imports protocol/ and contract/ only; reports go out through callbacks'
const SHARED = 'protocol/ imports contract/ only: both halves share it, so it knows neither'

// A module's files sit flat in modules/<name>/ (host.ts, frame.ts, types.ts, ...): a `../x` that
// is not `../..` reaches another module.
const NO_OTHER_MODULE = {
  regex: '^\\.\\./(?!\\.\\.)',
  message:
    'a module never imports another module: they meet through the registry and the event bus in core/',
}

const imports = (...patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
})

const FRAME_HALF = [
  FRAME_ONLY('ui'),
  FRAME_ONLY('transport'),
  FRAME_ONLY('core'),
  NO_HOST_HALF,
  NO_MODULES,
  NO_ENTRIES,
]

const zones = [
  { files: ['src/core/**'], rules: imports(NO_UI(KERNEL), NO_FRAME, NO_MODULES, NO_ENTRIES) },
  {
    files: ['src/transport/**'],
    rules: imports(NO_CORE(DOOR), NO_UI(DOOR), NO_FRAME, NO_MODULES, NO_ENTRIES),
  },
  {
    files: ['src/ui/**'],
    rules: imports(NO_CORE(DRAW), NO_TRANSPORT(DRAW), NO_FRAME, NO_MODULES, NO_ENTRIES),
  },
  {
    files: ['src/protocol/**'],
    rules: imports(
      NO_CORE(SHARED),
      NO_TRANSPORT(SHARED),
      NO_UI(SHARED),
      { ...NO_FRAME, message: SHARED },
      NO_MODULES,
      NO_ENTRIES,
    ),
  },
  { files: ['src/frame/**', 'src/entries/frame.ts'], rules: imports(...FRAME_HALF) },
  { files: ['src/entries/index.ts', 'src/entries/cdn.ts'], rules: imports(NO_FRAME) },
  // A module: host half, frame half, and the files both read.
  {
    files: ['src/modules/*/*.ts'],
    rules: imports(
      NO_OTHER_MODULE,
      NO_ENTRIES,
      NO_CORE(SHARED),
      NO_TRANSPORT(SHARED),
      NO_UI(SHARED),
      NO_FRAME,
    ),
  },
  {
    files: ['src/modules/*/host.ts', 'src/modules/*/host/**', 'tests/e2e/fixture-module/host.ts'],
    rules: imports(NO_OTHER_MODULE, NO_FRAME, NO_ENTRIES),
  },
  {
    files: [
      'src/modules/*/frame.ts',
      'src/modules/*/frame/**',
      'tests/e2e/fixture-module/frame.ts',
    ],
    rules: imports(NO_OTHER_MODULE, ...FRAME_HALF.filter((pattern) => pattern !== NO_MODULES)),
  },
]

const NETWORK =
  'only transport/ and frame/sender.ts call the network: send through the transport (host) or the frame sender (frame)'
const TEXT =
  'text reaches the DOM as a text node: use textContent, appendText or createLink (frame/dom), never markup'

const HTML_PROPERTIES = [
  { property: 'innerHTML', message: TEXT },
  { property: 'outerHTML', message: TEXT },
  { property: 'insertAdjacentHTML', message: TEXT },
  { object: 'document', property: 'write', message: TEXT },
  { object: 'document', property: 'writeln', message: TEXT },
]
const NETWORK_PROPERTIES = [
  { object: 'window', property: 'fetch', message: NETWORK },
  { object: 'globalThis', property: 'fetch', message: NETWORK },
  { object: 'self', property: 'fetch', message: NETWORK },
  {
    property: 'sendBeacon',
    message:
      'sendBeacon is never used: with a JSON body it is credentialed and was seen to arrive nowhere; telemetry is JSON with keepalive through transport/',
  },
]

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
  // The whole of src/ and the fixture module: no network but the two doors, no markup strings.
  {
    files: ['src/**/*.ts', 'tests/e2e/fixture-module/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: NETWORK },
        { name: 'XMLHttpRequest', message: NETWORK },
      ],
      'no-restricted-properties': ['error', ...NETWORK_PROPERTIES, ...HTML_PROPERTIES],
    },
  },
  {
    files: ['src/transport/**', 'src/frame/sender.ts'],
    rules: {
      'no-restricted-globals': ['error', { name: 'XMLHttpRequest', message: NETWORK }],
      'no-restricted-properties': ['error', NETWORK_PROPERTIES[3], ...HTML_PROPERTIES],
    },
  },
  ...zones,
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
