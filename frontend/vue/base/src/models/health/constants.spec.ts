import { describe, expect, it } from 'vitest'

import en from '@/core/i18n/translations/en.json'

import { HEALTH_STATUS } from './constants'

describe('HEALTH_STATUS', () => {
  it('gives each status a tone and a label the copy table has', () => {
    expect(Object.keys(HEALTH_STATUS)).toEqual(['ok', 'degraded'])
    expect(HEALTH_STATUS.ok.tone).toBe('success')
    expect(HEALTH_STATUS.degraded.tone).toBe('warning')
    expect(en.health.status).toHaveProperty('ok')
    expect(en.health.status).toHaveProperty('degraded')
    for (const { labelKey } of Object.values(HEALTH_STATUS)) {
      expect(labelKey).toMatch(/^health\.status\./)
    }
  })
})
