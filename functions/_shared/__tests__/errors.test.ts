import { describe, expect, it } from 'vitest'
import { jsonError } from '../errors'

describe('jsonError', () => {
  it('returns a JSON error envelope with status and headers', async () => {
    const response = jsonError(404, 'snapshot_not_found', 'Not found: snapshots/live.json')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'snapshot_not_found',
        message: 'Not found: snapshots/live.json',
      },
    })
  })
})
