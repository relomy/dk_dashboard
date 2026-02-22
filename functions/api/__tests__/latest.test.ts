import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../latest'
import type { EnvBindings } from '../../_shared/types'

type QueryKind = 'first' | 'all' | 'run'

interface D1Call {
  kind: QueryKind
  sql: string
  args: unknown[]
}

interface MockD1 {
  prepare: D1Database['prepare']
  calls: D1Call[]
}

interface MockR2Object {
  text: () => Promise<string>
}

interface MockR2Bucket {
  get: (key: string) => Promise<MockR2Object | null>
}

function createMockDb(sessionRow: Record<string, unknown> | null): MockD1 {
  const calls: D1Call[] = []
  return {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM sessions')) {
              return sessionRow
            }
            return null
          },
          all: async () => {
            calls.push({ kind: 'all', sql, args })
            return { results: [] as Record<string, unknown>[] }
          },
          run: async () => {
            calls.push({ kind: 'run', sql, args })
            return {}
          },
        }),
      } as ReturnType<D1Database['prepare']>
    },
  }
}

type TestEnv = Omit<EnvBindings, 'dk_dashboard_data' | 'AUTH_DB'> & {
  dk_dashboard_data: MockR2Bucket
  AUTH_DB: MockD1
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    SESSION_PEPPER: 'pepper_secret',
    AUTH_DB: createMockDb({
      session_id: 's1',
      user_id: 'u1',
      username: 'friend',
      role: 'friend',
      must_change_password: 0,
      password_hash: 'pbkdf2_sha256$1$salt$hash',
    }),
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
  it('returns 401 JSON error when session is missing', async () => {
    const response = await invoke('https://example.com/api/latest', buildEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Authentication required.',
      },
    })
  })

  it('returns 500 JSON error when SESSION_PEPPER is missing', async () => {
    const response = await invoke('https://example.com/api/latest', buildEnv({ SESSION_PEPPER: undefined }), {
      Cookie: 'session_token=tok_1',
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'server_misconfigured',
        message: 'SESSION_PEPPER is not configured.',
      },
    })
  })

  it('returns 404 JSON error when latest.json is missing', async () => {
    const response = await invoke('https://example.com/api/latest', buildEnv(), {
      Cookie: 'session_token=tok_1',
    })

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
      { Cookie: 'session_token=tok_1' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ generated_at: '2026-02-22T00:00:00Z' })
  })
})
