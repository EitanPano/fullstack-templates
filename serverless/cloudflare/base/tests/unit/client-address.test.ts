import { describe, expect, it } from 'vitest'

import { clientAddress, rateLimitSubject } from '../../server/services/utils/client-address'

describe('rateLimitSubject', () => {
  it('leaves an IPv4 address unchanged', () => {
    expect(rateLimitSubject('203.0.113.7')).toBe('203.0.113.7')
  })

  it('maps an IPv4-mapped IPv6 address to its IPv4', () => {
    expect(rateLimitSubject('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(rateLimitSubject('::ffff:cb00:7107')).toBe('203.0.113.7')
  })

  it('maps any other IPv6 address to its canonical /64, dropping a zone index', () => {
    expect(rateLimitSubject('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64')
    expect(rateLimitSubject('2001:DB8:1:2::1')).toBe('2001:db8:1:2::/64')
    expect(rateLimitSubject('fe80::1%eth0')).toBe('fe80::/64')
    expect(rateLimitSubject('2001:db8:1:2:aaaa::1')).toBe(rateLimitSubject('2001:db8:1:2:bbbb::2'))
    expect(rateLimitSubject('2001:db8:1:2::1')).not.toBe(rateLimitSubject('2001:db8:1:3::1'))
  })

  it('leaves something that is not an address unchanged', () => {
    expect(rateLimitSubject('not-an-ip')).toBe('not-an-ip')
  })
})

describe('clientAddress', () => {
  it('reads CF-Connecting-IP and falls back to one constant for a local run', () => {
    const withHeader = new Request('http://x/', { headers: { 'CF-Connecting-IP': '203.0.113.7' } })
    expect(clientAddress(withHeader)).toBe('203.0.113.7')
    expect(clientAddress(new Request('http://x/'))).toBe('local')
  })
})
