// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

interface AssetGroup {
  name: string
  installMode: string
  updateMode?: string
  resources: { files: string[] }
}
interface DataGroup {
  name: string
  urls: string[]
  cacheConfig: { strategy: string; maxAge: string; timeout?: string }
}
interface NgswConfig {
  index: string
  assetGroups: AssetGroup[]
  dataGroups?: DataGroup[]
  navigationUrls: string[]
}

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../ngsw-config.json', import.meta.url)), 'utf8'),
) as NgswConfig

// Angular's service worker has no negation in `dataGroups[].urls`: a `!` pattern is read as a
// literal path, so it excludes nothing. A data group is therefore an allowlist of public reads.
// This turns a `dataGroups` glob into the regular expression the worker builds (`**` any path,
// `*` one segment, `?` one character; `#` stands in for `**` while it is converted).
function matches(glob: string, path: string): boolean {
  const source = Array.from(glob.replaceAll('**', '#'))
    .map((char) => {
      if (char === '#') return '.*'
      if (char === '*') return '[^/]*'
      if (char === '?') return '[^/]'
      return '.+${}()|'.includes(char) ? `[${char}]` : char
    })
    .join('')
  return new RegExp(`^${source}$`).test(path)
}

const groups = config.dataGroups ?? []
const cachedBy = (path: string) =>
  groups.filter((item) => item.urls.some((url) => matches(url, path)))

describe('ngsw-config.json', () => {
  // The template declares no data group, so these hold trivially; a product that caches a public
  // read adds its group and both tests keep guarding it.
  it('uses no negative pattern in a data group (the worker ignores the `!`)', () => {
    for (const item of groups) {
      for (const url of item.urls) expect(url.startsWith('!'), `${item.name}: ${url}`).toBe(false)
    }
  })

  it('never caches account or auth endpoints', () => {
    for (const path of [
      '/api/user/me',
      '/api/user',
      '/api/user/42',
      '/api/auth/refresh',
      '/api/auth/otp',
    ]) {
      expect(cachedBy(path), path).toEqual([])
    }
  })

  it('prefetches the shell: index.html and the manifest', () => {
    const app = config.assetGroups.find((item) => item.name === 'app')
    expect(app?.installMode).toBe('prefetch')
    expect(app?.resources.files).toEqual(
      expect.arrayContaining(['/index.html', '/manifest.webmanifest']),
    )
  })

  it('versions the copy tables with the app: an asset group, not a data group', () => {
    expect(groups.map((item) => item.name)).not.toContain('i18n')
    const assets = config.assetGroups.find((item) => item.resources.files.includes('/i18n/**'))
    expect(assets?.installMode).toBe('lazy')
    expect(assets?.updateMode).toBe('prefetch')
  })

  it('does not rewrite API or copy-table navigations to index.html', () => {
    expect(config.navigationUrls).toEqual(expect.arrayContaining(['!/api/**', '!/i18n/**']))
  })
})
