import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../snapshot'
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

async function invoke(path: string, env: TestEnv, headers?: HeadersInit): Promise<Response> {
  return onRequestGet({
    request: new Request(`https://example.com/api/snapshot${path}`, { headers }),
    env,
  } as Parameters<typeof onRequestGet>[0])
}

describe('/api/snapshot', () => {
  it('returns 401 JSON error when session is missing', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Authentication required.',
      },
    })
  })

  it('returns 400 JSON error when path is invalid', async () => {
    const response = await invoke('?path=../secret.json', buildEnv(), { Cookie: 'session_token=tok_1' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'invalid_path',
        message: 'Invalid path. Use snapshots/* or manifest/* keys only.',
      },
    })
  })

  it('returns 404 JSON error when snapshot key is not found in R2', async () => {
    const response = await invoke('?path=snapshots/live.json', buildEnv(), { Cookie: 'session_token=tok_1' })

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
      { Cookie: 'session_token=tok_1' },
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
      { Cookie: 'session_token=tok_1' },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ date: '2026-02-22' })
  })
})
