import { describe, expect, it } from 'vitest'

import { onRequestGet } from '../me'
import { hashSessionToken } from '../../../_shared/security'
import type { EnvBindings } from '../../../_shared/types'

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

function createMockDb(row: Record<string, unknown> | null): MockD1 {
  const calls: D1Call[] = []

  const db: MockD1 = {
    calls,
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          first: async () => {
            calls.push({ kind: 'first', sql, args })
            if (sql.includes('FROM sessions')) {
              return row
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

  return db
}

type TestEnv = Omit<EnvBindings, 'AUTH_DB' | 'dk_dashboard_data'> & {
  AUTH_DB: MockD1
  dk_dashboard_data: { get: (key: string) => Promise<null> }
}

function buildEnv(overrides: Partial<TestEnv> = {}): TestEnv {
  return {
    AUTH_DB: createMockDb(null),
    SESSION_PEPPER: 'pepper_secret',
    dk_dashboard_data: {
      get: async () => null,
    },
    ...overrides,
  }
}

async function invoke(headers: HeadersInit, env: TestEnv): Promise<Response> {
  return onRequestGet({
    request: new Request('https://dashboard.example/api/auth/me', { headers }),
    env,
  } as Parameters<typeof onRequestGet>[0])
}

describe('/api/auth/me', () => {
  it('returns 401 when session cookie is missing', async () => {
    const response = await invoke({}, buildEnv())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthenticated',
        message: 'Authentication required.',
      },
    })
  })

  it('returns user identity when session is valid', async () => {
    const token = 'session-token'
    const tokenHash = await hashSessionToken(token, 'pepper_secret')

    const dbRow = {
      session_id: 's1',
      user_id: 'u1',
      username: 'friend',
      role: 'friend',
      must_change_password: 1,
    }

    const db = createMockDb(dbRow)
    const response = await invoke(
      {
        Cookie: `session_token=${token}`,
      },
      buildEnv({ AUTH_DB: db }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      user: {
        id: 'u1',
        username: 'friend',
        role: 'friend',
        must_change_password: true,
      },
    })

    const lookupCall = db.calls.find((call) => call.kind === 'first' && call.sql.includes('FROM sessions'))
    expect(lookupCall).toBeDefined()
    expect(lookupCall?.args[0]).toBe(tokenHash)
  })
})
