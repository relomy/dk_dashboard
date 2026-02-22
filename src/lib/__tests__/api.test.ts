import { describe, expect, it } from 'vitest'
import { buildApiUrl } from '../api'

describe('buildApiUrl', () => {
  it('uses mock path when mock mode is enabled', () => {
    expect(buildApiUrl('/api/latest', { useMock: true })).toContain('/mock/latest')
  })

  it('maps /api/snapshot query paths to /mock files in mock mode', () => {
    expect(buildApiUrl('/api/snapshot?path=snapshots/live.json', { useMock: true })).toContain(
      '/mock/snapshots/live.json',
    )
  })

  it('keeps /api paths unchanged when mock mode is disabled', () => {
    expect(buildApiUrl('/api/latest', { useMock: false })).toBe('/api/latest')
    expect(buildApiUrl('/api/snapshot?path=snapshots/live.json', { useMock: false })).toBe(
      '/api/snapshot?path=snapshots/live.json',
    )
  })
})
