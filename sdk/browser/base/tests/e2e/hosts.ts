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

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
) as {
  version: string
}
export const MAJOR = Number(pkg.version.split('.')[0])

export const LOADER_URL = `${API_ORIGIN}/api/sdk/dist/v${MAJOR}/loader.js`
export const CONFIG_URL = `${API_ORIGIN}/api/sdk/v1/config`
export const TELEMETRY_URL = `${API_ORIGIN}/api/sdk/v1/telemetry`
