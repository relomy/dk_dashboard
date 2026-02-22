import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../snapshot'
import type { EnvBindings } from '../../_shared/types'

interface MockR2Object {
  text: () => Promise<string>
}

interface MockR2Bucket {
  get: (key: string) => Promise<MockR2Object | null>
}

type TestEnv = Omit<EnvBindings, 'dk_dashboard_data'> & {
  dk_dashboard_data: MockR2Bucket
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    DASHBOARD_API_KEY: 'secret',
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

async function invoke(path: string, env: TestEnv, headers?: HeadersInit): Promise<Response> {
  return onRequestGet({
    request: new Request(`https://example.com/api/snapshot${path}`, { headers }),
    env,
  } as Parameters<typeof onRequestGet>[0])
}

describe('/api/snapshot', () => {
  it('returns 500 JSON error when DASHBOARD_API_KEY is missing', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv({ DASHBOARD_API_KEY: undefined }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'server_misconfigured',
        message: 'DASHBOARD_API_KEY is not configured.',
      },
    })
  })

  it('returns 401 JSON error when key mismatches', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv(), { 'X-Api-Key': 'wrong' })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key.',
      },
    })
  })

  it('returns 400 JSON error when path is invalid', async () => {
    const response = await invoke('?path=../secret.json', buildEnv(), { 'X-Api-Key': 'secret' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_path',
        message: 'Invalid path. Use snapshots/* or manifest/* keys only.',
      },
    })
  })

  it('returns 404 JSON error when snapshot key is not found in R2', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv(), { 'X-Api-Key': 'secret' })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'snapshot_not_found',
        message: 'Not found: snapshots/live.json',
      },
    })
  })

  it('returns 200 for snapshots path with cache header', async () => {
    const response = await invoke(
      '?path=snapshots/live.json',
      buildEnv({
        dk_dashboard_data: {
          get: async () => ({
            text: async () => JSON.stringify({ schema_version: 2 }),
          }),
        },
      }),
      { 'X-Api-Key': 'secret' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=60')
    await expect(response.json()).resolves.toEqual({ schema_version: 2 })
  })

  it('returns 200 for manifest path with no-store cache header', async () => {
    const response = await invoke(
      '?path=manifest/2026-02-22.json',
      buildEnv({
        dk_dashboard_data: {
          get: async () => ({
            text: async () => JSON.stringify({ date: '2026-02-22' }),
          }),
        },
      }),
      { 'X-Api-Key': 'secret' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ date: '2026-02-22' })
  })
})
