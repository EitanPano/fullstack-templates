import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Where the e2e listens. The API is on `localhost` and both hosts on `127.0.0.1`: another site,
// so the page is cross-origin to the frame and every call to the API is cross-site.
export const API_PORT = __SERVER_PORT__
export const LISTED_PORT = __PORT__
export const UNLISTED_PORT = LISTED_PORT + 1

export const API_ORIGIN = `http://localhost:${API_PORT}`
export const LISTED_ORIGIN = `http://127.0.0.1:${LISTED_PORT}`
export const UNLISTED_ORIGIN = `http://127.0.0.1:${UNLISTED_PORT}`

// Made up. The API lists the listed host for it and no other origin.
export const SDK_KEY = 'pk_e2e_listed'

// The one global the loader puts on a page, and the attribute that marks a slot.
export const GLOBAL = '__SDK_GLOBAL__'
export const SLOT = '__SDK_SLOT__'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as {
  version: string
}
export const MAJOR = Number(pkg.version.split('.')[0])

export const DIST_URL = `${API_ORIGIN}/api/sdk/dist/v${MAJOR}`
export const LOADER_URL = `${DIST_URL}/loader.js`
export const FRAME_CSS_URL = `${DIST_URL}/frame.css`
export const CONFIG_URL = `${API_ORIGIN}/api/sdk/v1/config`
export const TELEMETRY_URL = `${API_ORIGIN}/api/sdk/v1/telemetry`

// The API's own output, written by the config under `.tmp/` (git-ignored, and not cleared with
// `test-results/`): the one place a spec sees a request that reached the server from a frame the
// browser had already dropped.
export const API_LOG = fileURLToPath(new URL('../../.tmp/e2e/api.log', import.meta.url))
// The default sink's line in every server template: `sdk telemetry count=1` or, as a JSON line,
// `"message":"sdk telemetry received",...,"count":1`.
export const TELEMETRY_LINE = /sdk telemetry\b[^\n]*\bcount\W{1,3}1\b/

// An image the API's own origin does not hold: a spec answers it through the browser's routing, so
// the frame's policy is what is under test. The unlisted host serves a real one at `/image.png`.
export const OWN_IMAGE_URL = `${API_ORIGIN}/api/sdk/fixture.png`
export const UNLISTED_IMAGE_URL = `${UNLISTED_ORIGIN}/image.png`
export const OTHER_HTTPS_IMAGE_URL = 'https://images.example.test/fixture.png'
