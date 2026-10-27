// Serves the production build for the e2e suite: builds once, puts the static files where the
// standalone server looks for them, then runs it in this process, so Playwright's kill of the
// web server leaves nothing behind. `next start` would also work, but it warns under
// `output: 'standalone'`, and the image runs `server.js`, so this tests the same server.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const build = spawnSync('bun', ['run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
})
if (build.status !== 0) process.exit(build.status ?? 1)

const standalone = path.resolve('.next', 'standalone')
cpSync(path.resolve('.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
})
if (existsSync('public')) cpSync('public', path.join(standalone, 'public'), { recursive: true })

await import(pathToFileURL(path.join(standalone, 'server.js')).href)
