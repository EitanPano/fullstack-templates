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
interface NgswConfig {
  index: string
  assetGroups: AssetGroup[]
  dataGroups?: { name: string }[]
  navigationUrls: string[]
}

const config = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../ngsw-config.json', import.meta.url)), 'utf8'),
) as NgswConfig

describe('ngsw-config.json', () => {
  it('caches no API answer: there is no data group, so account and auth endpoints stay fresh', () => {
    // Angular's service worker has no negation in `dataGroups[].urls`: a `!` pattern is read as a
    // literal path. A product that caches a public read adds a group of explicit URLs, never a glob
    // that could reach /api/user or /api/auth, and extends this test with the paths it must not touch.
    expect(config.dataGroups ?? []).toEqual([])
  })

  it('prefetches the shell: index.html and the manifest', () => {
    const app = config.assetGroups.find((item) => item.name === 'app')
    expect(app?.installMode).toBe('prefetch')
    expect(app?.resources.files).toEqual(
      expect.arrayContaining(['/index.html', '/manifest.webmanifest']),
    )
  })

  it('versions the copy tables with the app: an asset group, not a data group', () => {
    expect((config.dataGroups ?? []).map((item) => item.name)).not.toContain('i18n')
    const assets = config.assetGroups.find((item) => item.resources.files.includes('/i18n/**'))
    expect(assets?.installMode).toBe('lazy')
    expect(assets?.updateMode).toBe('prefetch')
  })

  it('does not rewrite API or copy-table navigations to index.html', () => {
    expect(config.navigationUrls).toEqual(expect.arrayContaining(['!/api/**', '!/i18n/**']))
  })
})
