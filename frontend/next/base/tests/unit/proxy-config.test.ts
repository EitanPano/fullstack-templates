import { describe, expect, it } from 'vitest'

import { config } from '@/proxy'

// Next compiles the matcher with path-to-regexp; a source of one slash and a group is also a
// valid RegExp, anchored here the way Next anchors it.
const [source = ''] = config.matcher
const matcher = new RegExp('^' + source + '$')

describe('proxy matcher', () => {
  it.each(['/', '/profile', '/user/jane.doe', '/release/v1.2', '/sign-in', '/a.b/c'])(
    'refreshes the session on the page %s',
    (path) => {
      expect(matcher.test(path)).toBe(true)
    },
  )

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image',
    '/_next/data/x.json',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/logo.svg',
    '/images/hero.png',
    '/fonts/inter.woff2',
  ])('skips the static asset %s', (path) => {
    expect(matcher.test(path)).toBe(false)
  })
})
