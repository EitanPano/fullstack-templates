import { describe, expect, it } from 'bun:test'

import { captureLogs } from './logs'

describe('captureLogs', () => {
  it('captures the warnings and errors that match the allow-list', () => {
    const logs = captureLogs([/^expected /])

    console.warn('expected warning')
    console.error('expected error', new Error('boom'))

    expect(logs.lines).toHaveLength(2)
    expect(() => {
      logs.restore()
    }).not.toThrow()
  })

  it('fails on restore when a line is not on the allow-list, naming it', () => {
    const logs = captureLogs([/^expected /])

    console.error('surprise failure')

    expect(() => {
      logs.restore()
    }).toThrow(/unexpected log output[\s\S]*surprise failure/)
  })

  it('puts the console back even when it throws', () => {
    const before = console.error
    const logs = captureLogs([])
    console.error('anything')

    expect(() => {
      logs.restore()
    }).toThrow()
    expect(console.error).toBe(before)
  })
})
