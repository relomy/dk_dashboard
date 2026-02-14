import { describe, expect, it } from 'vitest'
import { buildApiUrl } from '../api'

describe('buildApiUrl', () => {
  it('uses mock path when mock mode is enabled', () => {
    expect(buildApiUrl('/api/latest', { useMock: true })).toContain('/mock/latest')
  })
})
