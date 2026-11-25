import assert from 'node:assert/strict'

const { destroy, init, mount, on, open, setConsent, setTheme } = await import(
  process.env.SDK_PACKAGE
)

// No `window`, no DOM: every call is a no-op, and nothing reaches the network.
assert.equal(typeof window, 'undefined')
globalThis.fetch = () => {
  throw new Error('the SDK called the network with no window')
}
const seen = []
const off = on('error', (event) => seen.push(event))
init({ key: 'pk_test', apiOrigin: 'https://api.example.test' })
setConsent('granted')
setTheme({ scheme: 'dark' })
mount('fixture', {})
open('fixture-modal')
destroy()
off()
assert.deepEqual(seen, [])
console.log('no-dom: init did nothing')
