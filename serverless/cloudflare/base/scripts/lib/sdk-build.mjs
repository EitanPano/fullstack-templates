// sdk-build (lib) belongs: putting the SDK's build into the folder the Worker's assets serve. Each
// `v<major>/` folder of the build gives its allow-listed scripts to `api/sdk/dist/v<major>/` and
// its `frame.html` to `api/sdk/frame/v<major>`, the two addresses the Worker serves them at
// (server/middleware/sdk-files.ts). The prefix `api/sdk/` is the Worker's: `/api/*` runs it before
// the platform's assets, so these files are never answered raw, with a `_headers` rule or without
// the frame's policy. The frame document is stored without its `.html` name, which the platform
// would redirect. It does not belong: the build of the SDK (its own command) or running wrangler.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

// The same forms the Worker serves: a major folder, a script in it.
const MAJOR = /^v[0-9]+$/
const SCRIPT = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/
const FRAME = 'frame.html'

const PREFIX = path.join('api', 'sdk')

// A frontend folder named `api` would hold these files: a request to that frontend's host for
// /sdk/frame/v1 would fetch `api/sdk/frame/v1` from the assets with the assets' own headers.
export function refuseApiFrontend(names, fail) {
  if (names.includes('api')) {
    throw fail(
      'the frontend directory "api" would hold the SDK files (api/sdk/) and serve them without the Worker: rename it',
    )
  }
}

const entries = (dir) => readdirSync(dir, { withFileTypes: true })

function refuseLink(entry, label, fail) {
  if (entry.isSymbolicLink()) {
    throw fail(`${label} holds a symbolic link (${entry.name}); copy the file instead`)
  }
}

// `fail` makes the error to throw (assemble's own). Copies the allow-listed files of `build` into
// `work` and returns the majors found. A build that is missing or empty fails, as a missing
// frontend build does (a deploy without it would answer 404 for the loader on every page); with
// `allowMissing` (a local run) `warn` says so instead and the Worker answers 404 for both routes.
export function addSdkBuild(work, build, warn, fail, allowMissing = false) {
  if (!existsSync(build) || entries(build).length === 0) {
    const message = `the SDK's build ${build} is missing or empty: build the SDK first`
    if (!allowMissing) throw fail(message)
    warn(`${message}; /api/sdk/dist and /api/sdk/frame answer 404`)
    return []
  }
  if (lstatSync(build).isSymbolicLink()) {
    throw fail('the SDK build is a symbolic link; it must be a real folder')
  }
  if (existsSync(path.join(work, PREFIX))) {
    throw fail(
      'the frontend output or static/ already holds api/sdk/, the folder of the SDK files: move it',
    )
  }
  const majors = []
  for (const folder of entries(build)) {
    refuseLink(folder, 'the SDK build', fail)
    if (!folder.isDirectory() || !MAJOR.test(folder.name)) continue
    const from = path.join(build, folder.name)
    const copied = []
    for (const file of entries(from)) {
      refuseLink(file, `the SDK build's ${folder.name}/`, fail)
      if (!file.isFile()) continue
      if (file.name === FRAME) {
        copied.push([path.join(from, file.name), path.join(work, PREFIX, 'frame', folder.name)])
      } else if (SCRIPT.test(file.name)) {
        copied.push([
          path.join(from, file.name),
          path.join(work, PREFIX, 'dist', folder.name, file.name),
        ])
      }
    }
    for (const [source, target] of copied) {
      mkdirSync(path.dirname(target), { recursive: true })
      cpSync(source, target)
    }
    if (copied.length > 0) majors.push(folder.name)
  }
  if (majors.length === 0) {
    const message = `the SDK's build ${build} holds no v<major> folder with a script or a frame.html`
    if (!allowMissing) throw fail(`${message}: build the SDK first`)
    warn(`${message}: nothing of it is served`)
  }
  return majors
}
