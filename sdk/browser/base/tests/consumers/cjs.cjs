const assert = require('node:assert/strict')

const sdk = require(process.env.SDK_PACKAGE)

assert.deepEqual(Object.keys(sdk).sort(), ['destroy', 'init', 'on', 'setConsent', 'version'])
assert.match(sdk.version, /^\d+\.\d+\.\d+/)
console.log(`cjs: ${process.env.SDK_PACKAGE} ${sdk.version}`)
