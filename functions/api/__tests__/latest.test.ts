import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../latest'
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

async function invoke(url: string, env: TestEnv, headers?: HeadersInit): Promise<Response> {
  return onRequestGet({
    request: new Request(url, { headers }),
    env,
  } as Parameters<typeof onRequestGet>[0])
}

describe('/api/latest', () => {
  it('returns 500 JSON error when DASHBOARD_API_KEY is missing', async () => {
    const response = await invoke('https://example.com/api/latest', buildEnv({ DASHBOARD_API_KEY: undefined }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'server_misconfigured',
        message: 'DASHBOARD_API_KEY is not configured.',
      },
    })
  })

  it('returns 401 JSON error when key mismatches', async () => {
    const response = await invoke(
      'https://example.com/api/latest',
      buildEnv(),
      { 'X-Api-Key': 'wrong' },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'Invalid or missing API key.',
      },
    })
  })

  it('returns 404 JSON error when latest.json is missing', async () => {
    const response = await invoke(
      'https://example.com/api/latest',
      buildEnv(),
      { 'X-Api-Key': 'secret' },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'latest_not_found',
        message: 'latest.json not found in storage.',
      },
    })
  })

  it('returns 200 JSON with no-store caching when latest.json exists', async () => {
    const response = await invoke(
      'https://example.com/api/latest',
      buildEnv({
        dk_dashboard_data: {
          get: async () => ({
            text: async () => JSON.stringify({ generated_at: '2026-02-22T00:00:00Z' }),
          }),
        },
      }),
      { 'X-Api-Key': 'secret' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ generated_at: '2026-02-22T00:00:00Z' })
  })
})
