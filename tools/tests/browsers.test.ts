import { describe, expect, test } from 'bun:test'
import { browserInstallCommand } from '../lib/browsers'

describe('browserInstallCommand', () => {
  test('adds system dependencies on linux only', () => {
    expect(browserInstallCommand('linux')).toBe('bun x playwright install --with-deps chromium')
    expect(browserInstallCommand('win32')).toBe('bun x playwright install chromium')
    expect(browserInstallCommand('darwin')).toBe('bun x playwright install chromium')
  })
  test('names the engines it is given', () => {
    const engines = ['chromium', 'firefox', 'webkit'] as const
    expect(browserInstallCommand('linux', engines)).toBe(
      'bun x playwright install --with-deps chromium firefox webkit',
    )
    expect(browserInstallCommand('win32', engines)).toBe(
      'bun x playwright install chromium firefox webkit',
    )
  })
})
