import assert from 'node:assert/strict'

// The tarball's own name, given by scripts/consumers.mjs: it differs in every project.
const sdk = await import(process.env.SDK_PACKAGE)

assert.deepEqual(Object.keys(sdk).sort(), [
  'destroy',
  'init',
  'mount',
  'on',
  'open',
  'setConsent',
  'setTheme',
  'version',
])
assert.match(sdk.version, /^\d+\.\d+\.\d+/)
console.log(`esm: ${process.env.SDK_PACKAGE} ${sdk.version}`)
